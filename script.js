const { createApp } = Vue;

createApp({

    data() {
        return {
            latitude: 40.4168,
            longitude: -3.7038,
            radius: 5,
            selectedFuel: '',
            brandFilter: '',
            brands: [],
            allStations: [],
            gasStations: [],
            showManualCoordinates: false,
            loading: false,
            error: '',
            searched: false,
            viewMode: 'list',
            map: null,
            markers: []
        };
    },

    methods: {

        async searchGasStations() {

            this.loading = true;
            this.error = '';
            this.searched = true;
            this.gasStations = [];
            this.viewMode = 'list';
            if (this.map) {
                this.map.remove();
                this.map = null;
                this.markers = [];
            }

            try {

                const apiUrl =
                    'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

                const response = await fetch(apiUrl);

                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status}`);
                }

                const data = await response.json();

                this.allStations =
                    this.processGasStations(data);

                this.loadBrandsFromStations(
                    this.allStations
                );

                this.applyFilters();

            } catch (err) {

                console.error(
                    'Error conectando con la API:',
                    err
                );

                this.error =
                    'No se pudo conectar con la API.';

            } finally {

                this.loading = false;
            }
        },

        processGasStations(data) {

            let stations = [];

            if (
                data &&
                data.ListaEESSPrecio &&
                Array.isArray(data.ListaEESSPrecio)
            ) {

                stations =
                    data.ListaEESSPrecio
                    .map(station => {

                        const lat =
                            this.convertNumber(
                                station['Latitud']
                            );

                        const lon =
                            this.convertNumber(
                                station['Longitud (WGS84)']
                            );

                        if (
                            isNaN(lat) ||
                            isNaN(lon)
                        ) {
                            return null;
                        }

                        const distance =
                            this.calculateDistance(
                                Number(this.latitude),
                                Number(this.longitude),
                                lat,
                                lon
                            );

                        return {

                            _lat: lat,
                            _lon: lon,

                            nombre:
                                station['Rótulo']
                                || 'Sin nombre',

                            empresa:
                                this.detectBrand(
                                    station['Rótulo']
                                ),

                            direccion:
                                station['Dirección']
                                || 'Sin dirección',

                            municipio:
                                station['Municipio']
                                || '',

                            horario:
                                station['Horario']
                                || 'No especificado',

                            distancia:
                                distance,

                            gasolina95:
                                station['Precio Gasolina 95 E5']
                                || null,

                            gasolina98:
                                station['Precio Gasolina 98 E5']
                                || null,

                            diesel:
                                station['Precio Gasoleo A']
                                || null,

                            dieselPremium:
                                station['Precio Gasoleo Premium']
                                || null
                        };

                    })
                    .filter(
                        station =>
                            station !== null
                    );
            }

            stations =
                stations.filter(
                    station =>
                        station.distancia <=
                        Number(this.radius)
                );

            stations =
                stations.sort(
                    (a, b) =>
                        a.distancia - b.distancia
                );

            return stations;
        },

        loadBrandsFromStations(stations) {

            const brandsSet = new Set();

            stations.forEach(station => {

                if (station.empresa) {

                    brandsSet.add(
                        station.empresa
                    );
                }
            });

            this.brands =
                Array.from(brandsSet)
                .sort();
        },

        applyFilters() {

            let filtered =
                [...this.allStations];

            if (this.selectedFuel) {

                filtered =
                    filtered.filter(station => {

                        if (
                            this.selectedFuel
                            === 'Gasolina 95'
                        ) {
                            return station.gasolina95;
                        }

                        if (
                            this.selectedFuel
                            === 'Gasolina 98'
                        ) {
                            return station.gasolina98;
                        }

                        if (
                            this.selectedFuel
                            === 'Diésel'
                        ) {
                            return station.diesel;
                        }

                        if (
                            this.selectedFuel
                            === 'Diésel+'
                        ) {
                            return station.dieselPremium;
                        }

                        return true;
                    });
            }

            if (this.brandFilter) {

                filtered =
                    filtered.filter(
                        station =>
                            station.empresa ===
                            this.brandFilter
                    );
            }

            this.gasStations = filtered;
        },

        detectBrand(rotulo) {

            if (!rotulo) return 'Otras';

            const r = rotulo.toUpperCase();

            if (r.includes('AGLA'))        return 'AGLA';
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

        convertNumber(value) {

            if (!value) {
                return NaN;
            }

            return parseFloat(
                value.replace(',', '.')
            );
        },

        calculateDistance(
            lat1,
            lon1,
            lat2,
            lon2
        ) {

            const R = 6371;

            const dLat =
                this.degToRad(lat2 - lat1);

            const dLon =
                this.degToRad(lon2 - lon1);

            const a =
                Math.sin(dLat / 2) *
                Math.sin(dLat / 2) +

                Math.cos(
                    this.degToRad(lat1)
                ) *

                Math.cos(
                    this.degToRad(lat2)
                ) *

                Math.sin(dLon / 2) *

                Math.sin(dLon / 2);

            const c =
                2 * Math.atan2(
                    Math.sqrt(a),
                    Math.sqrt(1 - a)
                );

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

        initMap() {
            if (!this.map) {
                this.map = L.map('map-container').setView(
                    [Number(this.latitude), Number(this.longitude)],
                    13
                );
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                }).addTo(this.map);
            } else {
                this.map.setView(
                    [Number(this.latitude), Number(this.longitude)],
                    13
                );
            }
            this.updateMap();
        },

        updateMap() {
            if (!this.map) return;

            this.markers.forEach(m => m.remove());
            this.markers = [];

            // Marcador de posición del usuario
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

            // Marcadores de gasolineras
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
                const marker = L.marker([lat, lon])
                    .addTo(this.map)
                    .bindPopup(popup);
                this.markers.push(marker);
            });

            // Ajustar zoom para que entren todos los marcadores
            if (this.markers.length > 1) {
                const group = L.featureGroup(this.markers);
                this.map.fitBounds(group.getBounds().pad(0.1));
            }
        },

        getLocation() {

            if (!navigator.geolocation) {

                this.error =
                    'Geolocalización no disponible en tu navegador.';

                return;
            }

            this.loading = true;
            this.error = '';

            navigator.geolocation.getCurrentPosition(

                position => {

                    this.latitude =
                        position.coords.latitude;

                    this.longitude =
                        position.coords.longitude;

                    this.loading = false;

                    this.searchGasStations();
                },

                error => {

                    this.loading = false;

                    this.error =
                        'No se pudo obtener ubicación. Puedes usar la búsqueda manual.';
                }
            );
        }
    }

}).mount('#app');