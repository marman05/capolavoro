<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ricerca Tratte Vecchie</title>
    <style>
    body {
    background-image: url('https://wallpapercave.com/wp/wp5682567.jpg');
    background-size: cover; /* per coprire l'intero sfondo */
    background-repeat: no-repeat; /* per evitare che l'immagine si ripeta */
    background-attachment: fixed; /* per fare in modo che lo sfondo rimanga fisso */
}
    
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f0f0f0;
        }
        #container {
            width: 400px;
            margin: 50px auto;
            background-color: #fff;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }
        h1 {
            text-align: center;
        }
        form {
            text-align: center;
        }
        input[type="text"] {
            width: 200px;
            padding: 10px;
            margin-bottom: 10px;
            border: 1px solid #ccc;
            border-radius: 5px;
        }
        input[type="submit"] {
            padding: 10px 20px;
            background-color: #007bff;
            color: #fff;
            border: none;
            border-radius: 5px;
            cursor: pointer;
        }
        input[type="submit"]:hover {
            background-color: #0056b3;
        }
        #result {
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div id="container">
        <h1>Ricerca Tratte Vecchie</h1>
        <form method="post" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]);?>">
            <input type="text" name="nome" placeholder="Nome" required><br>
            <input type="text" name="cognome" placeholder="Cognome" required><br>
            <input type="submit" name="submit" value="Cerca">
        </form>
        <div id="result">
            <?php
            if ($_SERVER["REQUEST_METHOD"] == "POST") {
                
                $citta = array("Roma", "Milano", "Napoli", "Torino", "Palermo", "Genova", "Bologna", "Firenze");

                $nome = $_POST['nome'];
                $cognome = $_POST['cognome'];

                // Generazione casuale del numero di tratte
                $num_tratte = rand(0, 6);
                echo "<h3>Tratte per $nome $cognome:</h3>";
                for ($i = 0; $i < $num_tratte; $i++) {
                    $partenza = $citta[array_rand($citta)];
                    $arrivo = $citta[array_rand($citta)];
                    while ($arrivo == $partenza) {
                        $arrivo = $citta[array_rand($citta)];
                    }
                    $codice_tratta = strtoupper(substr(md5($partenza . $arrivo . $i), 0, 6));
                    echo "<p>Tratta $codice_tratta: $partenza - $arrivo</p>";
                }
            }
            ?>
        </div>
    </div>
</body>
</html>

