import axios from "axios";

const DERIBIT_BASE_URL = "https://www.deribit.com/api/v2";
const CLIENT_ID = process.env.DERIBIT_CLIENT_ID || "";
const CLIENT_SECRET = process.env.DERIBIT_CLIENT_SECRET || "";

async function getAccessToken(): Promise<string> {
  const response = await axios.post(`${DERIBIT_BASE_URL}/public/auth`, {
    jsonrpc: "2.0",
    method: "public/auth",
    params: {
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    },
    id: 1,
  });
  return response.data.result.access_token;
}

async function fetchTrades() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.log("Missing Deribit credentials");
    return;
  }

  const token = await getAccessToken();
  const response = await axios.post(
    `${DERIBIT_BASE_URL}/private/get_user_trades_by_currency`,
    {
      jsonrpc: "2.0",
      method: "private/get_user_trades_by_currency",
      params: {
        currency: "BTC",
        count: 50,
        sorting: "desc",
      },
      id: 1,
    },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const trades = response.data.result.trades;
  console.log(`Fetched ${trades.length} BTC trades`);

  let winningTrades = 0;
  let losingTrades = 0;
  let totalProfit = 0;
  let totalLoss = 0;

  trades.forEach((t: any, i: number) => {
    const profitLoss = t.profit_loss || 0;
    if (profitLoss > 0) {
      winningTrades++;
      totalProfit += profitLoss;
    } else if (profitLoss < 0) {
      losingTrades++;
      totalLoss += Math.abs(profitLoss);
    }
    
    if (i < 5) {
        console.log(`Trade ${i+1}: ${t.instrument_name}, PnL: ${t.profit_loss}, Fee: ${t.fee} ${t.fee_currency}`);
    }
  });

  const totalTrades = winningTrades + losingTrades;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const avgProfit = winningTrades > 0 ? totalProfit / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;
  const plRatio = avgLoss !== 0 ? avgProfit / avgLoss : 0;

  console.log("\n--- Metrics Calculation ---");
  console.log(`Total Trades (with PnL): ${totalTrades}`);
  console.log(`Winning Trades: ${winningTrades}, Total Profit: ${totalProfit.toFixed(8)} BTC`);
  console.log(`Losing Trades: ${losingTrades}, Total Loss: ${totalLoss.toFixed(8)} BTC`);
  console.log(`Avg Profit: ${avgProfit.toFixed(8)} BTC`);
  console.log(`Avg Loss: ${avgLoss.toFixed(8)} BTC`);
  console.log(`Win Rate: ${winRate.toFixed(2)}%`);
  console.log(`P/L Ratio: ${plRatio.toFixed(4)}`);
}

fetchTrades().catch(console.error);
