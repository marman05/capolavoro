<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ricerca Tratta</title>
    <style>
        body {
            background-image: url('https://wallpapercave.com/wp/wp5682567.jpg');
            background-size: cover; /* per coprire l'intero sfondo */
            background-repeat: no-repeat; /* per evitare che l'immagine si ripeta */
            background-attachment: fixed; /* per fare in modo che lo sfondo rimanga fisso */
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
        }
        .container {
            width: 50%;
            margin: 0 auto;
            text-align: center;
            padding-top: 50px;
        }
        input[type="text"] {
            width: 70%;
            padding: 10px;
            margin-bottom: 20px;
        }
        input[type="submit"] {
            padding: 10px 20px;
            background-color: #4CAF50;
            color: white;
            border: none;
            cursor: pointer;
            border-radius: 5px;
        }
        #passeggeri {
            margin-top: 20px;
        }
        #passeggeri-container {
            display: none;
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            margin-top: 20px;
        }
        #example {
            color: #999;
            font-size: 0.8em;
            text-align: left;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>Ricerca Tratta</h2>
        <form id="searchForm">
            <label for="codice_tratta">Inserisci il codice della tratta:</label><br>
            <input type="text" id="codice_tratta" name="codice_tratta" pattern="\d{6}" title="Il codice tratta deve essere di 6 cifre" placeholder="(Esempio: 123456)" required><br>
            <input type="submit" value="Cerca">
        </form>
        <div id="passeggeri-container">
            <div id="passeggeri"></div>
        </div>
    </div>

    <script>
        document.getElementById("searchForm").addEventListener("submit", function(event) {
            event.preventDefault(); // Prevent the form from submitting
            cercaPasseggeri();
        });

        function cercaPasseggeri() {
            var codiceTrattaInput = document.getElementById("codice_tratta").value;

            // Se il campo codice della tratta è vuoto, non fare nulla
            if (!codiceTrattaInput.trim()) {
                return;
            }

            // Array di nomi e cognomi
            var nomi = ["Mario", "Luigi", "Giovanni", "Maria", "Anna", "Giacomo", "Giulia", "Roberto", "Sara", "Francesco", "Paolo", "Laura", "Alessandro", "Valentina", "Antonio", "Simona", "Davide", "Eleonora", "Marco", "Martina"];
            var cognomi = ["Rossi", "Verdi", "Bianchi", "Neri", "Gialli", "Marroni", "Blu", "Viola", "Verde", "Arancione", "Rosa", "Azzurri", "Grigi", "Belli", "Corti", "Lunghi", "Gentili", "Simpatici", "Forte", "Debole"];

            // Mescolare gli array di nomi e cognomi
            nomi = shuffleArray(nomi);
            cognomi = shuffleArray(cognomi);

            // Genera un numero casuale di passeggeri (da 5 a 10)
            var numPassengers = Math.floor(Math.random() * 6) + 5;

            // Genera l'elenco dei passeggeri e lo mostra sotto il pulsante Cerca
            var elencoPasseggeriContainer = document.getElementById("passeggeri-container");
            var elencoPasseggeri = document.getElementById("passeggeri");
            elencoPasseggeri.innerHTML = "<h3>Elenco Passeggeri:</h3><ul>";
            for (var i = 0; i < numPassengers; i++) {
                elencoPasseggeri.innerHTML += "<li>" + nomi[i] + " " + cognomi[i] + "</li>";
            }
            elencoPasseggeri.innerHTML += "</ul>";
            elencoPasseggeriContainer.style.display = "block";
        }

        // Funzione per mescolare un array
        function shuffleArray(array) {
            for (var i = array.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = array[i];
                array[i] = array[j];
                array[j] = temp;
            }
            return array;
        }
    </script>
</body>
</html>

