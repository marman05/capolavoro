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
        input, select {
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
        #orario_div {
            display: none;
        }
        option.disponibile {
            color: green;
        }
        option.non-disponibile {
            color: red;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Acquisto Biglietto</h1>
        <?php
        // Ricevi i dati dal modulo HTML
        if ($_SERVER["REQUEST_METHOD"] == "POST") {
            // Dati dell'utente
            $email = $_POST['email'];
            $nome = $_POST['nome'];
            $cognome = $_POST['cognome'];
            $data_nascita = $_POST['data_nascita'];
            $citta_partenza = $_POST['citta_partenza'];
            $citta_arrivo = $_POST['citta_arrivo'];

            // Scelte dell'utente
            $data = $_POST['data'];
            $orario = $_POST['orario'];

            // Contenuto dell'email
            $to = "destinatario@example.com"; // Inserisci qui l'indirizzo email del destinatario
            $subject = "Scelte dell'utente";
            $message = "Email: $email\n";
            $message .= "Nome: $nome\n";
            $message .= "Cognome: $cognome\n";
            $message .= "Data di Nascita: $data_nascita\n";
            $message .= "Città Partenza: $citta_partenza\n";
            $message .= "Città Arrivo: $citta_arrivo\n";
            $message .= "Data scelta: $data\n";
            $message .= "Orario scelto: $orario\n";

            // Invio dell'email
            if (mail($to, $subject, $message)) {
                echo "<p>Email inviata con successo!</p>";
            } else {
                echo "<p>Errore durante l'invio dell'email.</p>";
            }
        }
        ?>
        <form action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>" method="POST">
            <div>
                <label for="email">Email:</label>
                <input type="text" id="email" name="email" required>
            </div>
            <div>
                <label for="nome">Nome:</label>
                <input type="text" id="nome" name="nome" required>
            </div>
            <div>
                <label for="cognome">Cognome:</label>
                <input type="text" id="cognome" name="cognome" required>
            </div>
            <div>
                <label for="data_nascita">Data di Nascita:</label>
                <input type="date" id="data_nascita" name="data_nascita" required>
            </div>
            <div>
                <label for="citta_partenza">Città Partenza:</label>
                <input type="text" id="citta_partenza" name="citta_partenza" required>
            </div>
            <div>
                <label for="citta_arrivo">Città Arrivo:</label>
                <input type="text" id="citta_arrivo" name="citta_arrivo" required>
            </div>
            <div>
                <label for="data">Data:</label>
                <select name="data" id="data">
                    <?php
                    // Genera una lista di date casuali per i prossimi 7 giorni
                    for ($i = 0; $i < 7; $i++) {
                        $data = date('Y-m-d', strtotime('+' . $i . ' day'));
                        echo "<option value=\"$data\">$data</option>";
                    }
                    ?>
                </select>
            </div>
            <div id="orario_div">
                <label for="orario">Orario:</label>
                <select name="orario" id="orario" required>
                    <!-- Gli orari disponibili saranno aggiunti qui tramite JavaScript -->
                </select>
            </div>
            <button type="submit">Acquista Biglietto</button>
        </form>
    </div>

    <script>
        // Mostra il campo di selezione dell'orario quando viene selezionata una data
        document.getElementById("data").addEventListener("change", function() {
            var selectedDate = this.value;
            var orarioDiv = document.getElementById("orario_div");
            orarioDiv.style.display = "block";
            var orarioSelect = document.getElementById("orario");
            // Rimuovi gli orari precedenti
            orarioSelect.innerHTML = "";
            // Aggiungi gli orari disponibili
            for (var ora = 8; ora <= 22; ora++) {
                var disponibile = Math.random() < 0.5 ? "Disponibile" : "Non disponibile";
                var option = document.createElement("option");
                option.text = ora + ":00 - " + disponibile;
                option.value = ora;
                option.className = disponibile === "Disponibile" ? "disponibile" : "non-disponibile";
                orarioSelect.add(option);
            }
        });
    </script>
</body>
</html>
