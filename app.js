/** @format */

const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');

const app = express();

const port = 3000;
const clientId = 'ChessCord';

const pool = require('./pool.js');

app.use(session({ resave: true, secret: 'SECRET', saveUninitialized: true }));

app.use(express.static(path.join(__dirname, 'static')));

let discordID;

app.get('/', (req, res) => {
	discordID = req.query.id;
	res.sendFile(path.join(__dirname, 'static/index.html'));
});

// LOGIN
const base64URLEncode = (str) => {
	return str
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
};

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest();

const createVerifier = () => base64URLEncode(crypto.randomBytes(32));

const createChallenge = (verifier) => base64URLEncode(sha256(verifier));

app.get('/login', async (req, res) => {
	const url = req.protocol + '://' + req.get('host') + req.baseUrl;
	const verifier = createVerifier();
	const challenge = createChallenge(verifier);
	req.session.codeVerifier = verifier;
	res.redirect(
		'https://lichess.org/oauth?' +
			new URLSearchParams({
				response_type: 'code',
				client_id: clientId,
				redirect_uri: `${url}/callback`,
				scope: 'preference:read',
				code_challenge_method: 'S256',
				code_challenge: challenge,
			})
	);
});

// CALLBACK
const getLichessToken = async (authCode, verifier, url) =>
	await fetch('https://lichess.org/api/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			grant_type: 'authorization_code',
			redirect_uri: `${url}/callback`,
			client_id: clientId,
			code: authCode,
			code_verifier: verifier,
		}),
	}).then((res) => res.json());

const getLichessUser = async (accessToken) =>
	await fetch('https://lichess.org/api/account', {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	}).then((res) => res.json());

app.get('/callback', async (req, res) => {
	const url = req.protocol + '://' + req.get('host') + req.baseUrl;
	const verifier = req.session.codeVerifier;
	const lichessToken = await getLichessToken(req.query.code, verifier, url);

	if (!lichessToken.access_token) {
		res.send(
			`<script>
        window.alert("Failed getting access token.");
        window.location.href = "https://chesscord.com/discord";
      </script>`
		);
		return;
	}

	const ivBuffer = Buffer.from(process.env.ENCRYPTION_IV, 'hex');

	const cipher = crypto.createCipheriv(
		'aes-256-cbc',
		Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
		ivBuffer
	);

	let encrypted = cipher.update(lichessToken.access_token, 'utf8', 'hex');

	encrypted += cipher.final('hex');

	const lichessUser = await getLichessUser(lichessToken.access_token);

	const expires_at = new Date() + lichessToken.expires_in;

	const connection = await pool.getConnection();
	await connection.query(
		`INSERT INTO linked_users (id, lichess_username, lichess_token, expires_at) VALUES (?, ?, ?, ?)`,
		[discordID, lichessUser.username, encrypted, expires_at]
	);
	connection.release();

	res.send(
		`<script>
      window.alert("Successfully linked your account!");
      window.location.href = "https://chesscord.com/discord";
    </script>`
	);
});

app.listen(port);
