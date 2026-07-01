import { getDb, getTradesFromDb } from "./server/db";
import { trades } from "./drizzle/schema";
import { eq, desc } from "drizzle-orm";

async function debug() {
  const db = await getDb();
  if (!db) {
    console.log("Database not available");
    return;
  }

  console.log("--- Fetching last 10 BTC trades ---");
  const result = await getTradesFromDb({ currency: "BTC", limit: 10 });
  
  result.trades.forEach((t, i) => {
    console.log(`Trade ${i + 1}:`);
    console.log(`  Instrument: ${t.instrument}`);
    console.log(`  Direction: ${t.direction}`);
    console.log(`  Amount: ${t.amount}`);
    console.log(`  Price: ${t.price}`);
    console.log(`  Profit: ${t.profit}`);
    console.log(`  Fee: ${t.fee} ${t.feeCurrency}`);
    console.log(`  Timestamp: ${new Date(t.tradeTimestamp || 0).toISOString()}`);
    console.log("--------------------");
  });

  // Calculate metrics manually for these 10
  let winningTrades = 0;
  let losingTrades = 0;
  let totalProfit = 0;
  let totalLoss = 0;

  for (const trade of result.trades) {
    const profitLoss = trade.profit ? parseFloat(trade.profit) : 0;
    if (profitLoss > 0) {
      winningTrades++;
      totalProfit += profitLoss;
    } else if (profitLoss < 0) {
      losingTrades++;
      totalLoss += Math.abs(profitLoss);
    }
  }

  console.log("Manual Calculation (Last 10 BTC):");
  console.log(`  Wins: ${winningTrades}, Losses: ${losingTrades}`);
  console.log(`  Total Profit: ${totalProfit}, Total Loss: ${totalLoss}`);
  const avgWin = winningTrades > 0 ? totalProfit / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;
  console.log(`  Avg Win: ${avgWin}, Avg Loss: ${avgLoss}`);
  console.log(`  P/L Ratio: ${avgLoss !== 0 ? avgWin / avgLoss : 0}`);
}

debug().catch(console.error);
