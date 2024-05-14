<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Acquisto Biglietto</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-image: url('https://wallpapercave.com/wp/wp5682567.jpg');
            background-size: cover;
            background-repeat: no-repeat;
            background-attachment: fixed;
        }
        .container {
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background-color: rgba(255, 255, 255, 0.8);
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        h1 {
            text-align: center;
            color: #333;
        }
        form {
            margin-top: 30px;
        }
        label {
            display: block;
            font-weight: bold;
            margin-bottom: 5px;
        }
        input[type="text"] {
            padding: 8px;
            margin-bottom: 10px;
            border-radius: 5px;
            border: 1px solid #ccc;
            width: 100%;
            max-width: 300px;
        }
        button {
            padding: 10px 20px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.3s;
            width: 100%;
            max-width: 300px;
            margin: 20px auto;
            display: block;
        }
        button:hover {
            background-color: #45a049;
        }
        #prezzi {
            font-size: 16px;
            text-align: center;
        }
        #prezzi span {
            display: block;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Acquisto Biglietto</h1>
        <form id="form">
            <div>
                <label for="tratta">Tratta :</label>
                <input type="text" id="tratta" name="tratta" pattern="[A-Za-z0-9]{6}" required placeholder="Esempio: 1A2B3C">
            </div>
            <button type="button" onclick="cercaPrezzi()">Cerca</button>
        </form>
        <div id="prezzi" style="display: none;"></div>
    </div>

    <script>
        function cercaPrezzi() {
            var trattaInput = document.getElementById("tratta");
            var prezziDiv = document.getElementById("prezzi");

            // Genera e visualizza il prezzo per ogni tipo di posto
            var prezzoVIP = Math.floor(Math.random() * (100 - 60 + 1)) + 60; // Posto VIP (da 60 a 100)
            var prezzoPrimaClasse = Math.floor(Math.random() * (59 - 40 + 1)) + 40; // Prima classe (da 40 a 59)
            var prezzoPostoUnico = Math.floor(Math.random() * (30 - 5 + 1)) + 5; // Posto unico (da 5 a 30)

            prezziDiv.innerHTML = "<span>Il prezzo per il posto VIP è: " + prezzoVIP + " €</span>" +
                                   "<span>Il prezzo per la Prima Classe è: " + prezzoPrimaClasse + " €</span>" +
                                   "<span>Il prezzo per il Posto Unico è: " + prezzoPostoUnico + " €</span>";

            prezziDiv.style.display = "block";
        }
    </script>
</body>
</html>

