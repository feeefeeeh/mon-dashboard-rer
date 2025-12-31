require('dotenv').config();
const express = require('express');
const https = require('https');
const path = require('path');

const app = express();
const PORT = 3000;

// ⚠️ VOTRE CLÉ API

// On récupère la clé depuis le fichier .env (qui n'est pas publié)
const API_KEY = process.env.IDFM_API_KEY;
const ARRET_ID = "STIF:StopArea:SP:43076:"; // Epinay-sur-Orge

// On dit au serveur de distribuer les fichiers du dossier "public" (notre futur site)
app.use(express.static('public'));

// C'est ici que le site web viendra chercher les données (L'API interne)
app.get('/api/horaires', (req, res) => {
    
    const url = `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${encodeURIComponent(ARRET_ID)}`;
    const options = { headers: { 'apiKey': API_KEY, 'Accept': 'application/json' } };

    https.get(url, options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            try {
                const result = JSON.parse(data);
                const delivery = result.Siri.ServiceDelivery.StopMonitoringDelivery[0];

                if (!delivery.MonitoredStopVisit) {
                    return res.json({ error: "Aucun train" });
                }

                const responseData = { paris: [], sud: [] };
                const destinationsNord = ["Austerlitz", "Invalides", "Versailles", "Quentin", "Chaville", "Pontoise", "Javel", "Eiffel", "Gott"];

                delivery.MonitoredStopVisit.forEach(p => {
                    const train = p.MonitoredVehicleJourney;
                    const dest = train.DestinationName[0].value;
                    const mission = train.JourneyNote ? train.JourneyNote[0].value : "RER";
                    
                    // Calcul temps
                    const now = new Date();
                    const depart = new Date(train.MonitoredCall.ExpectedDepartureTime);
                    const diffMinutes = Math.floor((depart - now) / 60000);
                    let temps = (diffMinutes <= 0) ? "À quai" : `${diffMinutes} min`;

                    // Quai
                    let quai = "?";
                    if (train.MonitoredCall.ArrivalPlatformName) {
                        quai = train.MonitoredCall.ArrivalPlatformName.value;
                    }

                    // Objet propre pour le HTML
                    const trainInfo = {
                        mission: mission,
                        heure: depart.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}),
                        temps: temps,
                        dest: dest,
                        quai: quai,
                        proche: diffMinutes < 5 // Pour mettre en rouge si c'est proche
                    };

                    // Logique de tri
                    const isParis = (quai === "2") || destinationsNord.some(mot => dest.includes(mot));
                    
                    if (isParis) responseData.paris.push(trainInfo);
                    else responseData.sud.push(trainInfo);
                });

                // On envoie le JSON propre au site web
                res.json(responseData);

            } catch (e) {
                res.status(500).json({ error: e.message });
            }
        });
    }).on('error', (err) => res.status(500).json({ error: err.message }));
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur lancé !`);
    console.log(`💻 Sur votre PC : http://localhost:${PORT}`);
    console.log(`📱 Sur votre Téléphone : Cherchez l'IP locale de votre PC`);
});