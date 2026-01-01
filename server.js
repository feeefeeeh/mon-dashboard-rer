require('dotenv').config();
const express = require('express');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000; 

const API_KEY = process.env.IDFM_API_KEY; 
const ARRET_ID = "STIF:StopArea:SP:43076:"; // Gare Épinay-sur-Orge
const LIGNE_ID = "STIF:Line::C01727:";       // RER C

app.use(express.static('public'));

function callAPI(url) {
    return new Promise((resolve, reject) => {
        const options = { headers: { 'apiKey': API_KEY, 'Accept': 'application/json' } };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', err => reject(err));
    });
}

app.get('/api/horaires', async (req, res) => {
    try {
        console.log("🔄 Mise à jour demandée...");

        const urlHoraires = `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${encodeURIComponent(ARRET_ID)}`;
        const urlTrafic = `https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${encodeURIComponent(LIGNE_ID)}`;

        const [dataHoraires, dataTrafic] = await Promise.all([
            callAPI(urlHoraires),
            callAPI(urlTrafic)
        ]);

        // 1. TRAITEMENT HORAIRES
        const delivery = dataHoraires.Siri.ServiceDelivery.StopMonitoringDelivery[0];
        const responseData = { paris: [], sud: [], messages: [] };
        
        if (delivery.MonitoredStopVisit) {
            // LISTE COMPLÉTÉE : Ajout de Musée d'Orsay, St-Michel, Alma...
            const destinationsNord = [
                "Austerlitz", "Invalides", "Versailles", "Quentin", 
                "Chaville", "Pontoise", "Javel", "Eiffel", "Gott", 
                "Bibliothèque", "Mitterrand", "Champ de Mars", "Pereire",
                "Musée d'Orsay", "Orsay", "Saint-Michel", "Alma", "Laplace"
            ];

            delivery.MonitoredStopVisit.forEach(p => {
                const train = p.MonitoredVehicleJourney;
                const dest = train.DestinationName[0].value;
                const mission = train.JourneyNote ? train.JourneyNote[0].value : "RER";
                
                // Récupération Quai
                let quai = "?";
                if (train.MonitoredCall.ArrivalPlatformName) {
                    quai = train.MonitoredCall.ArrivalPlatformName.value;
                }
                
                // Debug console pour vérifier
                console.log(`🔎 Train : [${mission}] vers "${dest}" (Quai ${quai})`);

                const now = new Date();
                const depart = new Date(train.MonitoredCall.ExpectedDepartureTime);
                const diffMinutes = Math.floor((depart - now) / 60000);
                let temps = (diffMinutes <= 0) ? "À quai" : `${diffMinutes} min`;

                const trainInfo = {
                    mission: mission,
                    heure: depart.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'}),
                    temps: temps,
                    dest: dest,
                    quai: quai,
                    proche: diffMinutes < 5
                };

                // LOGIQUE DE TRI
                const quaiEst2 = (quai.trim() === "2");
                const destUpper = dest.toUpperCase();
                const vaVersNord = destinationsNord.some(mot => destUpper.includes(mot.toUpperCase()));

                if (quaiEst2 || vaVersNord) {
                    responseData.paris.push(trainInfo);
                } else {
                    responseData.sud.push(trainInfo);
                }
            });
        }

        // 2. TRAITEMENT TRAFIC
        const trafficDelivery = dataTrafic.Siri.ServiceDelivery.GeneralMessageDelivery[0];
        if (trafficDelivery && trafficDelivery.InfoMessage) {
            trafficDelivery.InfoMessage.forEach(msg => {
                const texte = msg.Content.Message[0].MessageText.value;
                responseData.messages.push(texte);
            });
        }

        res.json(responseData);

    } catch (e) {
        console.error("❌ ERREUR :", e);
        res.status(500).json({ error: "Erreur serveur ou API" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});