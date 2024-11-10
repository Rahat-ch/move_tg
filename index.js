const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // Import cors
const { Account, Aptos, AptosConfig, Network, Ed25519PrivateKey } = require('@aptos-labs/ts-sdk');

// Define the custom network configuration
const config = new AptosConfig({ 
    network: Network.CUSTOM,
    fullnode: 'https://aptos.testnet.porto.movementlabs.xyz/v1',
    faucet: 'https://fund.testnet.porto.movementlabs.xyz',
});

// Define the module address and functions
const MODULE_ADDRESS = '0x0eb6be0e57288a2e1a511906d929272589bfb3cb4aba309bf927752b1a623de2';
const CREATE_GAME_STATE_FUNCTION = `${MODULE_ADDRESS}::game::create_game_state`;
const GET_GAME_STATE_FUNCTION = `${MODULE_ADDRESS}::game::get_game_state`;
const UPDATE_GAME_STATE_FUNCTION = `${MODULE_ADDRESS}::game::update_game_state`;

// Replace with your private key (hex string without '0x' prefix)
const PRIVATE_KEY = 'bc9190ff0c1d98231fd23c75a7f80e5df4d408586f0dd9caee0e6e4d30785060';

// Initialize the Aptos client
const aptos = new Aptos(config);

// Create an account from the provided private key
const privateKey = new Ed25519PrivateKey(PRIVATE_KEY);
const userAccount = Account.fromPrivateKey({ privateKey });
const accountAddress = userAccount.accountAddress;

console.log({ addy: accountAddress.toString() });

// Initialize the Express app
const app = express();

// Use CORS middleware to allow all origins
app.use(cors());

// Use body-parser middleware to parse JSON requests
app.use(bodyParser.json());

// Function to display the board (same as before)
function displayBoard(board) {
    // Map each position to its symbol
    const symbols = board.map((value) => {
        if (value === 0) return ' ';
        if (value === 1) return 'X'; // Player's mark
        if (value === 2) return 'O'; // Opponent's mark
        return '?'; // Unknown value
    });

    // Display the board in a 3x3 grid
    console.log('Current Board State:');
    console.log(` ${symbols[0]} | ${symbols[1]} | ${symbols[2]} `);
    console.log('---+---+---');
    console.log(` ${symbols[3]} | ${symbols[4]} | ${symbols[5]} `);
    console.log('---+---+---');
    console.log(` ${symbols[6]} | ${symbols[7]} | ${symbols[8]} `);
}

// Function to get the game state
async function getGameState() {
    const viewPayload = {
        function: GET_GAME_STATE_FUNCTION,
        functionArguments: [accountAddress],
    };

    try {
        const gameState = await aptos.view({ payload: viewPayload });
        const [boardData, wins, losses, inProgress] = gameState;
        let board;
        if (typeof boardData === 'string') {
            // Convert hex string to array of numbers
            const boardBytes = Buffer.from(boardData.substring(2), 'hex');
            board = Array.from(boardBytes);
        } else if (Array.isArray(boardData)) {
            board = boardData;
        } else {
            throw new Error('Unexpected board data type');
        }

        return {
            board,
            wins: Number(wins),
            losses: Number(losses),
            inProgress,
        };
    } catch (error) {
        throw error;
    }
}

// Function to create the game state if it doesn't exist
async function createGameState() {
    // Build the transaction payload
    const payload = {
        function: CREATE_GAME_STATE_FUNCTION,
        functionArguments: [],
    };

    // Build the transaction
    const transaction = await aptos.transaction.build.simple({
        sender: accountAddress,
        data: payload,
    });

    // Sign the transaction
    const signature = aptos.transaction.sign({ signer: userAccount, transaction });

    // Submit the transaction to chain
    const committedTxn = await aptos.transaction.submit.simple({
        transaction,
        senderAuthenticator: signature,
    });

    // Wait for the transaction to be confirmed
    await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
}

// Function to update the game state
async function updateGameState(newBoard, newWins, newLosses, newInProgress) {
    // Build the transaction payload
    const updatePayload = {
        function: UPDATE_GAME_STATE_FUNCTION,
        functionArguments: [
            newBoard,
            newWins.toString(),
            newLosses.toString(),
            newInProgress,
        ],
    };

    // Build the transaction
    const updateTransaction = await aptos.transaction.build.simple({
        sender: accountAddress,
        data: updatePayload,
    });

    // Sign the transaction
    const updateSignature = aptos.transaction.sign({ signer: userAccount, transaction: updateTransaction });

    // Submit the transaction to chain
    const updateCommittedTxn = await aptos.transaction.submit.simple({
        transaction: updateTransaction, // Corrected variable name
        senderAuthenticator: updateSignature,
    });

    // Wait for the transaction to be confirmed
    await aptos.waitForTransaction({ transactionHash: updateCommittedTxn.hash });

    // Return the transaction hash
    return updateCommittedTxn.hash;
}

// GET /state - Read the game state
app.get('/state', async (req, res) => {
    try {
        let gameState;
        try {
            gameState = await getGameState();
        } catch (error) {
            // If the game state does not exist, create it
            console.log('Game state does not exist. Creating a new one.');
            await createGameState();
            gameState = await getGameState();
        }

        // Optionally display the board in the console
        displayBoard(gameState.board);

        // Return the game state
        res.json({
            board: gameState.board,
            wins: gameState.wins,
            losses: gameState.losses,
            inProgress: gameState.inProgress,
        });
    } catch (error) {
        console.error('Error getting game state:', error.message);
        res.status(500).json({ error: 'Error getting game state' });
    }
});

// POST /state - Update the game state
app.post('/state', async (req, res) => {
    const { board, wins, losses, inProgress } = req.body;

    if (!Array.isArray(board) || board.length !== 9) {
        return res.status(400).json({ error: 'Invalid board data' });
    }

    try {
        // Update the game state and get the transaction hash
        const transactionHash = await updateGameState(board, wins, losses, inProgress);

        // Optionally display the updated board in the console
        displayBoard(board);

        // Construct the transaction link
        const transactionLink = `https://explorer.movementnetwork.xyz/txn/${transactionHash}?network=porto+testnet`;

        res.json({
            message: 'Game state updated successfully',
            transactionLink: transactionLink,
        });
    } catch (error) {
        console.error('Error updating game state:', error.message);
        res.status(500).json({ error: 'Error updating game state' });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
