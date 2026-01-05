require('dotenv').config();
const express = require('express');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000; 

const API_KEY = process.env.IDFM_API_KEY; 

// 1. Dictionnaire des Gares
const STATIONS = {
    "epinay":  "STIF:StopArea:SP:43076:",
    "savigny": "STIF:StopArea:SP:43192:",
    "bfm":     "STIF:StopArea:SP:45301:",
    "Issy-VdS": "STIF:StopArea:SP:462357:"
};

const LIGNE_ID = "STIF:Line::C01727:"; // RER C

app.use(express.static('public'));

function callAPI(url) {
    return new Promise((resolve, reject) => {
        const options = { headers: { 'apiKey': API_KEY, 'Accept': 'application/json' } };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { resolve({}); }
            });
        }).on('error', err => reject(err));
    });
}

app.get('/api/horaires', async (req, res) => {
    try {
        // On récupère la gare demandée (par défaut epinay)
        const stationKey = req.query.station || "epinay";
        const arretId = STATIONS[stationKey];

        // URLs
        const urlHoraires = `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${encodeURIComponent(arretId)}`;
        const urlTrafic = `https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${encodeURIComponent(LIGNE_ID)}`;

        const [dataHoraires, dataTrafic] = await Promise.all([
            callAPI(urlHoraires),
            callAPI(urlTrafic)
        ]);

        const responseData = { paris: [], sud: [], messages: [] };

        // 1. TRAFIC
        if (dataTrafic.Siri && dataTrafic.Siri.ServiceDelivery.GeneralMessageDelivery) {
            const delivery = dataTrafic.Siri.ServiceDelivery.GeneralMessageDelivery[0];
            if (delivery.InfoMessage) {
                delivery.InfoMessage.forEach(msg => {
                    responseData.messages.push(msg.Content.Message[0].MessageText.value);
                });
            }
        }

        // 2. HORAIRES
        if (dataHoraires.Siri) {
            const delivery = dataHoraires.Siri.ServiceDelivery.StopMonitoringDelivery[0];
            
            if (delivery.MonitoredStopVisit) {
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
                    
                    let quai = train.MonitoredCall.ArrivalPlatformName ? train.MonitoredCall.ArrivalPlatformName.value : "?";
                    
                    const now = new Date();
                    const depart = new Date(train.MonitoredCall.ExpectedDepartureTime);
                    const diffMinutes = Math.floor((depart - now) / 60000);
                    let temps = (diffMinutes <= 0) ? "À quai" : `${diffMinutes} min`;

                    const trainInfo = {
                        mission: mission,
                        heure: depart.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit', timeZone: 'Europe/Paris'}),
                        temps: temps,
                        dest: dest,
                        quai: quai,
                        proche: diffMinutes < 5
                    };

                    const quaiEst2 = (quai.trim() === "2" || quai.trim() === "4"); // Savigny a parfois quai 4
                    const destUpper = dest.toUpperCase();
                    const vaVersNord = destinationsNord.some(mot => destUpper.includes(mot.toUpperCase()));

                    if (quaiEst2 || vaVersNord) {
                        responseData.paris.push(trainInfo);
                    } else {
                        responseData.sud.push(trainInfo);
                    }
                });
            }
        }

        // --- FILTRAGE FINAL SELON VOTRE DEMANDE ---
        
        if (stationKey === 'epinay') {
            // Pour Epinay : On supprime totalement la liste SUD
            responseData.sud = [];
        } 
        else if (stationKey === 'bfm') {
            // Pour BFM : On supprime totalement la liste PARIS (car on veut rentrer)
            responseData.paris = [];
            const missionOmbibus = ["ELBA","DEBA","PAUL","BALI","DEBO","BOBA"];
            responseData.sud = responseData.sud.filter(train => {
                return missionOmbibus.includes(train.mission);
            });
        }
        else if (stationKey == 'Issy-VdS'){
            responseData.paris = [];
         
        }
        
        responseData.paris = responseData.paris.slice(0,5);
        responseData.sud = responseData.sud.slice(0,5);

        res.json(responseData);

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Erreur technique" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur prêt sur le port ${PORT}`);
});