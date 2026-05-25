const { createApp } = Vue;

createApp({
    data() {
        return {
            // Coordenadas por defecto (Madrid) y configuración de búsqueda
            latitude: 40.4168,
            longitude: -3.7038,
            radius: 5,

            // Variables de filtrado y ordenación
            selectedFuel: '',
            brandFilter: '',
            sortBy: 'distance', // Criterio por defecto: más cercanas
            
            // Colecciones de datos
            brands: [],
            allStations: [],
            gasStations: [],

            // Control de estado de la UI
            showManualCoordinates: false,
            loading: false,
            error: '',
            searched: false,
            viewMode: 'list',
            
            // Instancias de Leaflet para control de mapas
            map: null,
            markers: []
        };
    },

    methods: {
        /**
         * Llama a la API del Ministerio, procesa la respuesta y carga los datos iniciales
         */
        async searchGasStations() {
            this.loading = true;
            this.error = '';
            this.searched = true;
            this.gasStations = [];
            this.viewMode = 'list';
            
            // Limpieza del mapa si ya existía una instancia previa
            if (this.map) {
                this.map.remove();
                this.map = null;
                this.markers = [];
            }

            try {
                const apiUrl = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
                const response = await fetch(apiUrl);

                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status}`);
                }

                const data = await response.json();

                // Mapeamos y calculamos distancias iniciales
                this.allStations = this.processGasStations(data);

                // Extraemos las marcas únicas disponibles para el filtro
                this.loadBrandsFromStations(this.allStations);

                // Aplicamos los filtros y ordenaciones iniciales
                this.applyFilters();

            } catch (err) {
                console.error('Error conectando con la API:', err);
                this.error = 'No se pudo conectar con la API.';
            } finally {
                this.loading = false;
            }
        },

        /**
         * Transforma la estructura de la API a objetos limpios y calcula distancias
         */
        processGasStations(data) {
            let stations = [];

            if (data && data.ListaEESSPrecio && Array.isArray(data.ListaEESSPrecio)) {
                stations = data.ListaEESSPrecio.map(station => {
                    const lat = this.convertNumber(station['Latitud']);
                    const lon = this.convertNumber(station['Longitud (WGS84)']);

                    // Si las coordenadas no son válidas, descartamos el registro
                    if (isNaN(lat) || isNaN(lon)) {
                        return null;
                    }

                    // Calculamos distancia usando la fórmula de Haversine
                    const distance = this.calculateDistance(
                        Number(this.latitude),
                        Number(this.longitude),
                        lat,
                        lon
                    );

                    return {
                        _lat: lat,
                        _lon: lon,
                        nombre: station['Rótulo'] || 'Sin nombre',
                        empresa: this.detectBrand(station['Rótulo']),
                        direccion: station['Dirección'] || 'Sin dirección',
                        municipio: station['Municipio'] || '',
                        horario: station['Horario'] || 'No especificado',
                        distancia: distance,
                        gasolina95: station['Precio Gasolina 95 E5'] || null,
                        gasolina98: station['Precio Gasolina 98 E5'] || null,
                        diesel: station['Precio Gasoleo A'] || null,
                        dieselPremium: station['Precio Gasoleo Premium'] || null
                    };
                }).filter(station => station !== null);
            }

            // Filtrado estricto por el radio de kilómetros indicado
            stations = stations.filter(station => station.distancia <= Number(this.radius));

            // Ordenación inicial por cercanía
            stations = stations.sort((a, b) => a.distancia - b.distancia);

            return stations;
        },

        /**
         * Crea un conjunto de marcas únicas para el desplegable del formulario
         */
        loadBrandsFromStations(stations) {
            const brandsSet = new Set();
            stations.forEach(station => {
                if (station.empresa) {
                    brandsSet.add(station.empresa);
                }
            });
            this.brands = Array.from(brandsSet).sort();
        },

        /**
         * Filtra la lista según carburante/marca y aplica el criterio de ordenación seleccionado
         */
        applyFilters() {
            let filtered = [...this.allStations];

            // 1. Filtrado por carburante
            if (this.selectedFuel) {
                filtered = filtered.filter(station => {
                    if (this.selectedFuel === 'Gasolina 95') return station.gasolina95;
                    if (this.selectedFuel === 'Gasolina 98') return station.gasolina98;
                    if (this.selectedFuel === 'Diésel') return station.diesel;
                    if (this.selectedFuel === 'Diésel+') return station.dieselPremium;
                    return true;
                });
            }

            // 2. Filtrado por marca
            if (this.brandFilter) {
                filtered = filtered.filter(station => station.empresa === this.brandFilter);
            }

            // 3. Ordenación dinámica de resultados (Distancia o Precios de combustibles)
            filtered.sort((a, b) => {
                if (this.sortBy === 'priceG95') {
                    const priceA = a.gasolina95 ? this.convertNumber(a.gasolina95) : Infinity;
                    const priceB = b.gasolina95 ? this.convertNumber(b.gasolina95) : Infinity;
                    return priceA - priceB;
                } 
                else if (this.sortBy === 'priceDiesel') {
                    const priceA = a.diesel ? this.convertNumber(a.diesel) : Infinity;
                    const priceB = b.diesel ? this.convertNumber(b.diesel) : Infinity;
                    return priceA - priceB;
                } 
                else {
                    return a.distancia - b.distancia;
                }
            });

            this.gasStations = filtered;
            
            // Forzar actualización de marcadores en el mapa si está activo
            if (this.viewMode === 'map') {
                Vue.nextTick(() => {
                    this.updateMap();
                });
            }
        },
		
		/**
         * Analiza el texto del horario de la API y comprueba si está abierta en este momento
         */
        checkIfOpen(horarioTexto) {
            if (!horarioTexto || horarioTexto.includes('No especificado')) return 'unknown';
            
            // Si es 24 horas, siempre está abierta
            if (horarioTexto.toUpperCase().includes('24H')) return 'open';

            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const currentTime = currentHour + currentMinute / 60; // Hora actual en formato decimal (ej: 14.5)

            // Busramos patrones de horas como "06:00-22:00" en el texto
            const timeRegex = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g;
            let match;
            let isOpen = false;
            let hasValidHours = false;

            while ((match = timeRegex.exec(horarioTexto)) !== null) {
                hasValidHours = true;
                const startHour = parseInt(match[1]) + parseInt(match[2]) / 60;
                let endHour = parseInt(match[3]) + parseInt(match[4]) / 60;

                // Si la hora de cierre es menor que la de apertura (ej: 06:00 - 02:00 del día siguiente)
                if (endHour <= startHour) {
                    endHour += 24; 
                }

                let checkTime = currentTime;
                // Si estamos de madrugada y el horario cruza la medianoche
                if (currentTime < startHour && endHour > 24) {
                    checkTime += 24;
                }

                if (checkTime >= startHour && checkTime <= endHour) {
                    isOpen = true;
                }
            }

            if (!hasValidHours) return 'unknown'; // Si tiene un formato raro que no entendemos
            return isOpen ? 'open' : 'closed';
        },

        /**
         * Normaliza el nombre comercial basándose en el rótulo de la estación
         */
        detectBrand(rotulo) {
            if (!rotulo) return 'Otras';
            const r = rotulo.toUpperCase();

            if (r.includes('AGLA'))       return 'AGLA';
            if (r.includes('ALCAMPO'))    return 'ALCAMPO';
            if (r.includes('AUTOIL'))     return 'AUTOIL';
            if (r.includes('AUTONETOIL')) return 'AUTONETOIL';
            if (r.includes('AVANZA'))     return 'AVANZA';
            if (r.includes('AVIA'))       return 'AVIA';
            if (r.includes('BALLENOIL'))  return 'BALLENOIL';
            if (r.includes('BEROIL'))     return 'BEROIL';
            if (r.includes('BP'))         return 'BP';
            if (r.includes('CAMPSA'))     return 'CAMPSA';
            if (r.includes('CARREFOUR'))  return 'CARREFOUR';
            if (r.includes('CEPSA'))      return 'CEPSA';
            if (r.includes('DISA'))       return 'DISA';
            if (r.includes('EROSKI'))     return 'EROSKI';
            if (r.includes('ESCLATOIL'))  return 'ESCLATOIL';
            if (r.includes('GALP'))       return 'GALP';
            if (r.includes('HAM'))        return 'HAM';
            if (r.includes('IBERDOEX'))   return 'IBERDOEX';
            if (r.includes('IDS'))        return 'IDS';
            if (r.includes('MEROIL'))     return 'MEROIL';
            if (r.includes('MOEVE'))      return 'MOEVE';
            if (r.includes('MOLGAS'))     return 'MOLGAS';
            if (r.includes('NATURGY'))    return 'NATURGY';
            if (r.includes('NIEVES'))     return 'NIEVES';
            if (r.includes('PETROCAT'))   return 'PETROCAT';
            if (r.includes('PETRONOR'))   return 'PETRONOR';
            if (r.includes('PETROPRIX'))  return 'PETROPRIX';
            if (r.includes('PLENERGY'))   return 'PLENERGY';
            if (r.includes('PLENOIL'))    return 'PLENOIL';
            if (r.includes('Q8'))         return 'Q8';
            if (r.includes('REPSOL'))     return 'REPSOL';
            if (r.includes('SARAS'))      return 'SARAS';
            if (r.includes('SHELL'))      return 'SHELL';
            if (r.includes('TAMOIL'))     return 'TAMOIL';

            return rotulo;
        },

        /**
         * Utilidad para transformar cadenas de texto numéricas con comas en floats válidos
         */
        convertNumber(value) {
            if (!value) return NaN;
            return parseFloat(value.replace(',', '.'));
        },

        /**
         * Calcula los kilómetros en línea recta entre dos puntos geográficos (Fórmula de Haversine)
         */
        calculateDistance(lat1, lon1, lat2, lon2) {
            const R = 6371; // Radio de la Tierra en km
            const dLat = this.degToRad(lat2 - lat1);
            const dLon = this.degToRad(lon2 - lon1);
            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(this.degToRad(lat1)) * Math.cos(this.degToRad(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        },

        degToRad(deg) {
            return deg * (Math.PI / 180);
        },

        setViewMode(mode) {
            this.viewMode = mode;
            if (mode === 'map') {
                Vue.nextTick(() => {
                    this.initMap();
                });
            }
        },

        /**
         * Inicializa el lienzo del mapa de OpenStreetMap utilizando Leaflet
         */
        initMap() {
            if (!this.map) {
                this.map = L.map('map-container').setView(
                    [Number(this.latitude), Number(this.longitude)],
                    13
                );
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap'
                }).addTo(this.map);
            } else {
                this.map.setView([Number(this.latitude), Number(this.longitude)], 13);
            }
            this.updateMap();
        },

        /**
         * Refresca los marcadores del mapa basándose en la lista actual filtrada y ordenada
         */
        updateMap() {
            if (!this.map) return;

            // Limpiamos capas de marcadores antiguos
            this.markers.forEach(m => m.remove());
            this.markers = [];

            // Añadir pin personalizado de ubicación del usuario
            const userIcon = L.divIcon({
                html: '<div style="background:#2563eb;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 6px rgba(37,99,235,0.6)"></div>',
                className: '',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            });
            const userMarker = L.marker(
                [Number(this.latitude), Number(this.longitude)],
                { icon: userIcon }
            ).addTo(this.map).bindPopup('<strong>Tu ubicación</strong>');
            this.markers.push(userMarker);

            // Renderizar pines de las estaciones de servicio en el mapa
            this.gasStations.forEach(station => {
                const lat = station._lat;
                const lon = station._lon;
                if (!lat || !lon) return;

                let pricesHtml = '';
                if (station.gasolina95) pricesHtml += `<span class="popup-price">G95 · ${station.gasolina95} €/L</span>`;
                if (station.gasolina98) pricesHtml += `<span class="popup-price">G98 · ${station.gasolina98} €/L</span>`;
                if (station.diesel)     pricesHtml += `<span class="popup-price">Diésel · ${station.diesel} €/L</span>`;
                if (station.dieselPremium) pricesHtml += `<span class="popup-price">D+ · ${station.dieselPremium} €/L</span>`;

                const popup = `
                    <h3>${station.nombre}</h3>
                    <p>${station.direccion}</p>
                    <p>${station.distancia.toFixed(2)} km</p>
                    <div class="popup-prices">${pricesHtml}</div>
                `;
                const marker = L.marker([lat, lon]).addTo(this.map).bindPopup(popup);
                this.markers.push(marker);
            });

            // Ajuste dinámico de zoom para encuadrar todos los resultados
            if (this.markers.length > 1) {
                const group = L.featureGroup(this.markers);
                this.map.fitBounds(group.getBounds().pad(0.1));
            }
        },

        /**
         * Intenta capturar la posición del dispositivo vía API de geolocalización del navegador
         */
        getLocation() {
            if (!navigator.geolocation) {
                this.error = 'Geolocalización no disponible en tu navegador.';
                return;
            }

            this.loading = true;
            this.error = '';

            navigator.geolocation.getCurrentPosition(
                position => {
                    this.latitude = position.coords.latitude;
                    this.longitude = position.coords.longitude;
                    this.loading = false;
                    this.searchGasStations();
                },
                error => {
                    this.loading = false;
                    this.error = 'No se pudo obtener ubicación. Puedes usar la búsqueda manual.';
                }
            );
        }
    }
}).mount('#app');