const jwt = require('jsonwebtoken');
const secretKey = 'your-very-secure-secret-key';
const bcrypt = require("bcrypt");
const fixedSalt = "$2b$10$6cVYpoC1YmEYs1Hs9E2RJ."
const express = require("express");
const app = express();
const { addWordFromDatabase, readWordsFromDatabase, deleteWordFromDatabase,
    wordExistsinDatabase, getRandomWordObject, addnewMatchToDatabase,
    addnewUsertoDatabase, addNewGuesstoDatabase, readMatchFromDatabase,
    readGuessesFromDatabase, updateRemainingLivestoDatabase, updateStatustoDatabase,
    readUserFromDatabaseByEmail, readUserFromDatabase, updateScoreToDatabase } = require("./database");

const { getObscuredWord, isInputSingleCharAndLowerCaseEnglishCharOnly, isGuessCorrect, validateToken } = require("./hangman_utils");

app.use(express.json());

app.listen(5000, (req, res) => {
    console.log("Server is listening on port 5000...")
});

app.post("/user/register", async (req, res) => {
    const role = "player";
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const passwordValidation = /^.*(?=.{8,})(?=.*[a-zA-Z])(?=.*\d)(?=.*[!#$%&? "]).*$/;


    const { firstName, lastName, email, password } = req.body;
    if (firstName.length < 3) {
        return res.status(400).json({ message: "Firstname should be atleast 3 characters long!" });
    }
    if (lastName.length < 3) {
        return res.status(400).json({ message: "lastname should be atleast 3 characters long!" });
    }
    if (!emailPattern.test(email)) {
        return res.status(400).json({ message: "Invalid email format!" });
    }
    if (!passwordValidation.test(password)) {
        return res.status(400).json({ message: "Password should contain atleast 1 lowercase,1 uppercase, 1 digit, 1 special character" });
    }

    const hash = await bcrypt.hash(password, fixedSalt);


    const userInfo = { firstName, lastName, email, password: hash, role };


    const newUser = await addnewUsertoDatabase(userInfo);
    const { password: pwd, ...newUserWithoutPassword } = newUser;

    res.status(200).json(newUserWithoutPassword);
    return;
});

app.post("/user/login", async (req, res) => {

    const { email, password } = req.body;
    const user = await readUserFromDatabaseByEmail(email);
    const hashedPw = await bcrypt.hash(password, fixedSalt);

    if (!user) {
        return res.status(401).json({ message: "no such user exists" });
    }
    if (user.password == hashedPw) {
        const payload = {
            userId: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            role: user.role
        };
        const token = jwt.sign(payload, secretKey, { expiresIn: '1y' });
        return res.status(200).json({ token });
    }

    return res.status(401).json({ message: "Incorrect  Password" });
})
app.get("/match/new", async (req, res) => {
    const decodedToken = validateToken(req.headers.authorization);
    if (decodedToken == null) {
        return res.status(401).json({ message: "Authorization token missing" })
    }
    const randomWord = await getRandomWordObject();
    const obscuredWord = getObscuredWord(randomWord.word, [])

    const newMatch = {
        player_id: decodedToken.userId,
        word: randomWord.word,
        description: randomWord.description,
        remaining_lives: 5,
        status: "running"
    }
    const match = await addnewMatchToDatabase(newMatch);
    match.word = obscuredWord;
    match.description = randomWord.description;
    res.status(200).json(match);
    return;

})

app.post("/match/:matchId/guess", async (req, res) => {
    const decodedToken = validateToken(req.headers.authorization);
    if (decodedToken == null) {
        return res.status(401).json({ message: "Authorization token missing" })
    }

    const { guess } = req.body;
    const { matchId } = req.params;
    const guessWord = { guess };
    const currentMatch = await readMatchFromDatabase(matchId);

    const match = currentMatch[0];
    if (match.status != "running") {
        res.status(400).json({ message: "Match Ended" })
    }
    const isValidChar = isInputSingleCharAndLowerCaseEnglishCharOnly(guessWord.guess);
    if (!isValidChar) {
        return res.status(400).json({ message: "Invalid format!" })
    }
    const guessCheck = isGuessCorrect(match.word, guessWord.guess);
    const guesses = await readGuessesFromDatabase(matchId)
    for (let i = 0; i < guesses.length; i++) {
        let arrOfStr = guesses[i].guess;
        if (arrOfStr == guessWord.guess) {
            return res.status(400).json({ message: "already guessed" })
        }
    }
    await addNewGuesstoDatabase(guessWord, matchId);
    const user = await readUserFromDatabase(1);
    if (guessCheck) {
        user.score++;
        await updateScoreToDatabase(user.score, 1)
        const guesses = await readGuessesFromDatabase(matchId)
        const newGuess = [];
        for (let i = 0; i < guesses.length; i++) {
            let arrOfStr = guesses[i].guess;
            newGuess.push(arrOfStr)
        }
        const obscuredWord = getObscuredWord(match.word, newGuess);
        if (match.word == obscuredWord) {
            match.status = "won";
            await updateStatustoDatabase(matchId, match.status);
            return res.status(200).json({ message: "You won!" });
        }

        return res.status(200).json({ message: "correct guess" });
    }

    else {
        user.score--;
        await updateScoreToDatabase(user.score, 1)
        match.remaining_lives--;
        await updateRemainingLivestoDatabase(matchId, match.remaining_lives);
        if (match.remaining_lives == 0) {
            match.status = "lost"
            await updateStatustoDatabase(matchId, match.status);
            return res.status(200).json({ message: "You lost!" });
        }
        return res.status(200).json({ message: "Incorrect guess" });

    }



});

app.get("/match/:matchId", async (req, res) => {
    const decodedToken = validateToken(req.headers.authorization);
    if (decodedToken == null) {
        return res.status(401).json({ message: "Authorization token missing" })
    }
    const { matchId } = req.params;
    const guesses = await readGuessesFromDatabase(matchId)
    const currentMatch = await readMatchFromDatabase(matchId);
    const newGuess = [];
    for (let i = 0; i < guesses.length; i++) {
        let arrOfStr = guesses[i].guess;
        newGuess.push(arrOfStr)
    }
    const match = currentMatch[0];
    const obscuredWord = getObscuredWord(match.word, newGuess);
    match.word = obscuredWord;
    res.status(200).json(match);
    return;
});



app.get("/home", (req, res) => {
    res.status(200).send("home page");
})

app.get("/words", async (req, res) => {
    const decodedToken = validateToken(req.headers.authorization);
    if (decodedToken == null) {
        return res.status(401).json({ message: "Authorization token missing" })
    }
    if (decodedToken.role != "admin") {
        return res.status(403).json({ message: "Only allowed for admins" })
    }

    const words = await readWordsFromDatabase();
    res.status(200).json(words); return;
});

app.post("/words", async (req, res) => {
    const decodedToken = validateToken(req.headers.authorization);
    if (decodedToken == null) {
        return res.status(401).json({ message: "Authorization token missing" })
    }
    if (decodedToken.role != "admin") {
        return res.status(403).json({ message: "Only allowed for admins" })
    }

    const { word, description } = req.body;
    let regx = /^[a-z]+$/g;

    if (word && description && word.length >= 3 && regx.test(word)) {
        const found = await wordExistsinDatabase(word);
        if (!found) {

            const newWordObject = {
                word: word,
                description: description
            };
            await addWordFromDatabase(newWordObject);
            res.status(201).json({ message: 'Word added successfully' });
            return;
        }
        else {
            res.status(400).json({ message: 'Word already exists' });
            return;
        }
    }
    else {
        res.status(400).json({ message: 'Invalid input' });
        return;
    }
})

app.delete("/words/:word", async (req, res) => {
    const decodedToken = validateToken(req.headers.authorization);
    if (decodedToken == null) {
        return res.status(401).json({ message: "Authorization token missing" })
    }
    if (decodedToken.role != "admin") {
        return res.status(403).json({ message: "Only allowed for admins" })
    }

    const { word } = req.params;

    let wordFound = await wordExistsinDatabase(word);

    if (!wordFound) {
        return res.status(404).json({ message: 'Word not found' });
    }

    await deleteWordFromDatabase({ "word": word });
    return res.status(200).json({ message: "Word deleted" });







})



