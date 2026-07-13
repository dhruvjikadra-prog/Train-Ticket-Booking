require("dotenv").config();

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const readline = require("readline");

const Admin = require("../models/Admin");

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_MONGO_URI = "mongodb://127.0.0.1/Train_Booking";

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

function askHidden(question) {
    return new Promise((resolve) => {
        const stdin = process.stdin;
        let input = "";

        process.stdout.write(question);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding("utf8");

        const onData = (char) => {
            char = char.toString();

            if (char === "\n" || char === "\r" || char === "\u0004") {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener("data", onData);
                process.stdout.write("\n");
                resolve(input);
                return;
            }

            if (char === "\u0003") process.exit();

            if (char === "\u007f" || char === "\b") {
                input = input.slice(0, -1);
                return;
            }

            input += char;
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(question + "*".repeat(input.length));
        };

        stdin.on("data", onData);
    });
}

async function main() {
    console.log("=== Create admin account ===\n");

    const name = await ask("Full name: ");
    const emailRaw = await ask("Email: ");
    const email = emailRaw.toLowerCase().trim();

    if (!name) {
        console.error("\nName is required. Aborting.");
        process.exit(1);
    }

    if (!EMAIL_PATTERN.test(email)) {
        console.error("\nThat does not look like a valid email address. Aborting.");
        process.exit(1);
    }

    const password = await askHidden("Password (min 12 chars, upper+lower+digit+symbol): ");
    const confirm = await askHidden("Confirm password: ");

    if (password !== confirm) {
        console.error("\nPasswords did not match. Aborting.");
        process.exit(1);
    }

    if (!PASSWORD_POLICY.test(password)) {
        console.error(
            "\nPassword needs 12+ characters with at least one upper-case letter, one lower-case letter, one digit, and one symbol. Aborting."
        );
        process.exit(1);
    }

    const roleAnswer = (await ask("Role [admin/superadmin] (default: admin): ")).toLowerCase();
    const role = roleAnswer === "superadmin" ? "superadmin" : "admin";

    await mongoose.connect(process.env.MONGO_URI || DEFAULT_MONGO_URI);

    const existing = await Admin.findOne({ email });
    if (existing) {
        console.error(`\nAn admin with email ${email} already exists. Aborting.`);
        process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await Admin.create({ name, email, passwordHash, role });

    console.log(`\nAdmin account created: ${email} (${role}).`);
    console.log("2FA is off by default. Enable it from an admin panel after first login.");

    await mongoose.disconnect();
    process.exit(0);
}

main().catch((error) => {
    console.error("Failed to create admin:", error.message);
    process.exit(1);
});
