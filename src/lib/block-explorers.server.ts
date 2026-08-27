// Server-only wrappers around free public block explorer APIs, used to
// verify a user-submitted deposit TxID against the real chain. Every
// exported function returns the same normalized shape and never throws —
// callers (deposit-verification.server.ts) always get a result they can act
// on, with the raw provider response attached for the audit log.
//
// Testnet endpoints, matching this app's current testnet framing:
//   - USDT-TRC20 -> Tron Shasta testnet (Tronscan)
//   - USDT-BEP20 -> BSC testnet, via Etherscan's unified v2 API (same key as ETH)
//   - BTC        -> Bitcoin testnet3 (Blockstream, no key needed)
//   - ETH        -> Ethereum Sepolia (Etherscan, needs a free API key)
//   - LTC        -> Litecoin testnet3 (BlockCypher, no key needed for light use)

export type ExplorerCheckResult = {
  found: boolean;
  confirmed: boolean;
  confirmations: number;
  /** Destination address the funds actually landed on, if any. */
  toAddress: string | null;
  /** Address that actually sent the funds (primary/first input for UTXO chains), if determinable. */
  fromAddress: string | null;
  /** Human-readable amount (already divided by the coin/token's decimals). */
  amount: number | null;
  error?: string;
  raw?: unknown;
};

const NOT_FOUND: ExplorerCheckResult = {
  found: false,
  confirmed: false,
  confirmations: 0,
  toAddress: null,
  fromAddress: null,
  amount: null,
};

function errorResult(message: string): ExplorerCheckResult {
  return { ...NOT_FOUND, error: message };
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

// ---------- Tron (Shasta testnet) — USDT-TRC20 ----------

export async function fetchTronTx(params: {
  txHash: string;
  masterAddress: string;
  tokenContract: string | null;
}): Promise<ExplorerCheckResult> {
  const { txHash, masterAddress, tokenContract } = params;
  const apiKey = process.env["TRONSCAN_API_KEY"];
  try {
    const { ok, json } = await fetchJson(
      `https://shastapi.tronscan.org/api/transaction-info?hash=${encodeURIComponent(txHash)}`,
      apiKey ? { headers: { "TRON-PRO-API-KEY": apiKey } } : {},
    );
    if (!ok || !json || typeof json !== "object") return { ...NOT_FOUND, raw: json ?? undefined };
    const data = json as Record<string, unknown>;
    if (!data["hash"]) return { ...NOT_FOUND, raw: json };

    const confirmed = data["confirmed"] === true;
    const contractRet = typeof data["contractRet"] === "string" ? data["contractRet"] : null;
    const failed = contractRet !== null && contractRet !== "SUCCESS";

    if (tokenContract) {
      const transfers = Array.isArray(data["trc20TransferInfo"]) ? (data["trc20TransferInfo"] as Record<string, unknown>[]) : [];
      const match = transfers.find(
        (t) =>
          String(t["contract_address"] ?? "").toLowerCase() === tokenContract.toLowerCase() &&
          String(t["to_address"] ?? "").toLowerCase() === masterAddress.toLowerCase(),
      );
      if (!match) return { ...NOT_FOUND, raw: json };
      const decimals = Number(match["decimals"] ?? 6);
      const amount = Number(match["amount"] ?? 0) / 10 ** decimals;
      return {
        found: true,
        confirmed: confirmed && !failed,
        confirmations: confirmed ? 1 : 0,
        toAddress: String(match["to_address"]),
        fromAddress: match["from_address"] ? String(match["from_address"]) : null,
        amount,
        raw: json,
      };
    }

    // Native TRX transfer.
    const contractData = data["contractData"] as Record<string, unknown> | undefined;
    const toAddress = contractData?.["to_address"] ? String(contractData["to_address"]) : null;
    if (!toAddress) return { ...NOT_FOUND, raw: json };
    const amount = Number(contractData?.["amount"] ?? 0) / 1e6;
    return {
      found: true,
      confirmed: confirmed && !failed,
      confirmations: confirmed ? 1 : 0,
      toAddress,
      fromAddress: contractData?.["owner_address"] ? String(contractData["owner_address"]) : null,
      amount,
      raw: json,
    };
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : "Tronscan request failed");
  }
}

// ---------- EVM chains (BSC testnet, Ethereum Sepolia) — shared shape ----------

async function evmTokenTransfer(params: {
  baseUrl: string;
  apiKeyParam: string;
  txHash: string;
  masterAddress: string;
  tokenContract: string;
}): Promise<ExplorerCheckResult> {
  const { baseUrl, apiKeyParam, txHash, masterAddress, tokenContract } = params;
  try {
    const url = `${baseUrl}&module=account&action=tokentx&address=${masterAddress}&contractaddress=${tokenContract}&sort=desc${apiKeyParam}`;
    const { ok, json } = await fetchJson(url);
    if (!ok || !json || typeof json !== "object") return { ...NOT_FOUND, raw: json ?? undefined };
    const data = json as { status?: string; result?: unknown };
    if (data.status !== "1" || !Array.isArray(data.result)) return { ...NOT_FOUND, raw: json };
    const match = (data.result as Record<string, unknown>[]).find(
      (t) => String(t["hash"] ?? "").toLowerCase() === txHash.toLowerCase(),
    );
    if (!match) return { ...NOT_FOUND, raw: json };
    const decimals = Number(match["tokenDecimal"] ?? 18);
    const amount = Number(match["value"] ?? 0) / 10 ** decimals;
    const confirmations = Number(match["confirmations"] ?? 0);
    return {
      found: true,
      confirmed: confirmations > 0,
      confirmations,
      toAddress: String(match["to"] ?? ""),
      fromAddress: match["from"] ? String(match["from"]) : null,
      amount,
      raw: json,
    };
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : "Explorer request failed");
  }
}

async function evmNativeTx(params: {
  baseUrl: string;
  apiKeyParam: string;
  txHash: string;
}): Promise<ExplorerCheckResult> {
  const { baseUrl, apiKeyParam, txHash } = params;
  try {
    const [txRes, blockRes] = await Promise.all([
      fetchJson(`${baseUrl}&module=proxy&action=eth_getTransactionByHash&txhash=${txHash}${apiKeyParam}`),
      fetchJson(`${baseUrl}&module=proxy&action=eth_blockNumber${apiKeyParam}`),
    ]);
    const tx = (txRes.json as { result?: Record<string, unknown> } | null)?.result;
    if (!txRes.ok || !tx || !tx["to"]) return { ...NOT_FOUND, raw: txRes.json ?? undefined };

    const currentBlockHex = (blockRes.json as { result?: string } | null)?.result;
    const txBlockHex = tx["blockNumber"] ? String(tx["blockNumber"]) : null;
    let confirmations = 0;
    if (currentBlockHex && txBlockHex) {
      confirmations = Math.max(0, parseInt(currentBlockHex, 16) - parseInt(txBlockHex, 16) + 1);
    }

    const amount = Number(BigInt(String(tx["value"] ?? "0x0"))) / 1e18;
    return {
      found: true,
      confirmed: confirmations > 0,
      confirmations,
      toAddress: String(tx["to"]),
      fromAddress: tx["from"] ? String(tx["from"]) : null,
      amount,
      raw: txRes.json,
    };
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : "Explorer request failed");
  }
}

export async function fetchBscTx(params: {
  txHash: string;
  masterAddress: string;
  tokenContract: string | null;
}): Promise<ExplorerCheckResult> {
  const key = process.env["ETHERSCAN_API_KEY"];
  if (!key) return errorResult("ETHERSCAN_API_KEY is not configured");
  // BscScan now runs on Etherscan's unified v2 API too — same key, chainid
  // selects the chain (97 = BSC testnet).
  const baseUrl = "https://api.etherscan.io/v2/api?chainid=97";
  const apiKeyParam = `&apikey=${key}`;
  return params.tokenContract
    ? evmTokenTransfer({ baseUrl, apiKeyParam, txHash: params.txHash, masterAddress: params.masterAddress, tokenContract: params.tokenContract })
    : evmNativeTx({ baseUrl, apiKeyParam, txHash: params.txHash });
}

export async function fetchEthTx(params: {
  txHash: string;
  masterAddress: string;
  tokenContract: string | null;
}): Promise<ExplorerCheckResult> {
  const key = process.env["ETHERSCAN_API_KEY"];
  if (!key) return errorResult("ETHERSCAN_API_KEY is not configured");
  // Etherscan's unified v2 API selects the chain via chainid (11155111 = Sepolia).
  const baseUrl = "https://api.etherscan.io/v2/api?chainid=11155111";
  const apiKeyParam = `&apikey=${key}`;
  return params.tokenContract
    ? evmTokenTransfer({ baseUrl, apiKeyParam, txHash: params.txHash, masterAddress: params.masterAddress, tokenContract: params.tokenContract })
    : evmNativeTx({ baseUrl, apiKeyParam, txHash: params.txHash });
}

// ---------- Bitcoin testnet3 (Blockstream, no key required) ----------

export async function fetchBtcTx(params: { txHash: string; masterAddress: string }): Promise<ExplorerCheckResult> {
  try {
    const { ok, status, json } = await fetchJson(`https://blockstream.info/testnet/api/tx/${params.txHash}`);
    if (status === 404) return NOT_FOUND;
    if (!ok || !json || typeof json !== "object") return { ...NOT_FOUND, raw: json ?? undefined };
    const data = json as {
      vin?: { prevout?: { scriptpubkey_address?: string } }[];
      vout?: { scriptpubkey_address?: string; value?: number }[];
      status?: { confirmed?: boolean; block_height?: number };
    };
    const vout = data.vout ?? [];
    const toMaster = vout.filter((o) => o.scriptpubkey_address?.toLowerCase() === params.masterAddress.toLowerCase());
    if (toMaster.length === 0) return { ...NOT_FOUND, raw: json };
    const amount = toMaster.reduce((sum, o) => sum + Number(o.value ?? 0), 0) / 1e8;
    // Primary sender = first input's previous-output address. Good enough for
    // the common single-signer wallet case; a multi-input tx pooling several
    // signers' UTXOs would only bind the first one, which is an acceptable
    // simplification for this anti-race-condition check.
    const fromAddress = data.vin?.[0]?.prevout?.scriptpubkey_address ?? null;

    let confirmations = 0;
    if (data.status?.confirmed && data.status.block_height) {
      const tip = await fetchJson("https://blockstream.info/testnet/api/blocks/tip/height");
      const tipHeight = Number(tip.json ?? 0);
      if (tipHeight > 0) confirmations = Math.max(0, tipHeight - data.status.block_height + 1);
    }

    return {
      found: true,
      confirmed: !!data.status?.confirmed,
      confirmations,
      toAddress: toMaster[0]?.scriptpubkey_address ?? null,
      fromAddress,
      amount,
      raw: json,
    };
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : "Blockstream request failed");
  }
}

// ---------- Litecoin testnet3 (BlockCypher) ----------

export async function fetchLtcTx(params: { txHash: string; masterAddress: string }): Promise<ExplorerCheckResult> {
  try {
    const token = process.env["BLOCKCYPHER_TOKEN"];
    const url = `https://api.blockcypher.com/v1/ltc/test3/txs/${params.txHash}?limit=50${token ? `&token=${token}` : ""}`;
    const { ok, status, json } = await fetchJson(url);
    if (status === 404) return NOT_FOUND;
    if (!ok || !json || typeof json !== "object") return { ...NOT_FOUND, raw: json ?? undefined };
    const data = json as {
      confirmations?: number;
      inputs?: { addresses?: string[] }[];
      outputs?: { addresses?: string[]; value?: number }[];
    };
    const outputs = data.outputs ?? [];
    const toMaster = outputs.filter((o) => (o.addresses ?? []).some((a) => a.toLowerCase() === params.masterAddress.toLowerCase()));
    if (toMaster.length === 0) return { ...NOT_FOUND, raw: json };
    const amount = toMaster.reduce((sum, o) => sum + Number(o.value ?? 0), 0) / 1e8;
    const confirmations = Number(data.confirmations ?? 0);
    // Primary sender = first input's first address (see BTC comment above).
    const fromAddress = data.inputs?.[0]?.addresses?.[0] ?? null;
    return {
      found: true,
      confirmed: confirmations > 0,
      confirmations,
      toAddress: params.masterAddress,
      fromAddress,
      amount,
      raw: json,
    };
  } catch (e) {
    return errorResult(e instanceof Error ? e.message : "BlockCypher request failed");
  }
}
