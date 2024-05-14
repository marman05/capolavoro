<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stazione</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
        }
        .background {
            background-image: url('https://wallpapercave.com/wp/wp5682567.jpg');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container {
            max-width: 800px;
            padding: 20px;
            background-color: rgba(255, 255, 255, 0.8);
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        h1 {
            text-align: center;
            color: #333;
            font-size: 2.5em; /* Aumentato la dimensione del font */
            font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; /* Utilizzato un font migliore */
            margin-bottom: 30px; /* Aumentato il margine inferiore per spaziare dal contenuto sottostante */
        }
        .image-container {
            display: flex;
            justify-content: center;
            align-items: center;
            flex-wrap: wrap;
            gap: 20px; /* Spazio tra i pulsanti */
        }
        .image-container .button {
            flex: 1 1 300px; /* Larghezza fissa dei pulsanti */
            max-width: 300px; /* Larghezza massima */
        }
        .button {
            display: block;
            padding: 15px 30px; /* Modificato il padding per rendere i pulsanti più grandi */
            background-color: #4CAF50;
            color: white;
            text-decoration: none;
            border-radius: 8px; /* Aumentato il bordo per un aspetto più arrotondato */
            transition: background-color 0.3s;
            text-align: center;
            margin-top: 10px;
            width: 100%; /* Larghezza al 100% per adattarsi al contenitore */
        }
        .button:hover {
            background-color: #45a049;
        }
    </style>
</head>
<body>
    <div class="background">
        <div class="container">
            <h1>Esplora, Prenota e Parti </h1>
            <div class="image-container">
                <a href="acquista_biglietto.php" class="button">Acquista Biglietto</a>
                <a href="cerca_tratta.php" class="button">Cerca Tratte Passate</a>
                <a href="elenco_passeggeri.php" class="button">Elenco Passeggeri di una Tratta</a>
                <a href="calcola_prezzo.php" class="button">Calcola Prezzo Tratta</a>
            </div>
        </div>
    </div>
</body>
</html>


