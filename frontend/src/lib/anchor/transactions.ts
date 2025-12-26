import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import { AnchorWallet } from '@solana/wallet-adapter-react';
import {
  Connection,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { getPositionPDA } from './client';

export function parseTokenAmount(amount: string, decimals: number): BN {
  const normalized = amount.trim();
  if (!normalized) return new BN(0);
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Invalid amount format');
  }

  const [whole, fraction = ''] = normalized.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  const base = 10n ** BigInt(decimals);
  const raw =
    BigInt(whole || '0') * base + BigInt(paddedFraction || '0');

  return new BN(raw.toString());
}

export function parseIntegerAmount(amount: string): BN {
  const normalized = amount.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('Invalid integer amount');
  }
  return new BN(normalized);
}

export async function getTokenProgramId(
  connection: Connection,
  mint: PublicKey
): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint);
  if (!info) {
    throw new Error('Mint account not found');
  }
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return TOKEN_2022_PROGRAM_ID;
  }
  return TOKEN_PROGRAM_ID;
}

export async function getOrCreateAtaIx(params: {
  connection: Connection;
  payer: PublicKey;
  owner: PublicKey;
  mint: PublicKey;
}): Promise<{
  address: PublicKey;
  tokenProgramId: PublicKey;
  instruction?: TransactionInstruction;
}> {
  const { connection, payer, owner, mint } = params;
  const tokenProgramId = await getTokenProgramId(connection, mint);
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  const ataInfo = await connection.getAccountInfo(ata);
  if (ataInfo) {
    return { address: ata, tokenProgramId };
  }

  const instruction = createAssociatedTokenAccountInstruction(
    payer,
    ata,
    owner,
    mint,
    tokenProgramId,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  return { address: ata, tokenProgramId, instruction };
}

export async function ensurePositionIx(params: {
  connection: Connection;
  program: Program;
  marketId: Buffer;
  market: PublicKey;
  owner: PublicKey;
  payer: PublicKey;
}): Promise<{
  positionPda: PublicKey;
  instruction?: TransactionInstruction;
}> {
  const { connection, program, marketId, market, owner, payer } = params;
  const [positionPda] = getPositionPDA(marketId, owner);
  const info = await connection.getAccountInfo(positionPda);
  if (info) {
    return { positionPda };
  }

  const instruction = await program.methods
    .createPosition(Array.from(marketId))
    .accounts({
      payer,
      owner,
      market,
      position: positionPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return { positionPda, instruction };
}

function formatTxLogSummary(logs?: string[] | null): string | null {
  if (!logs || logs.length === 0) return null;
  const instructionLine = logs.find((line) =>
    line.includes('Program log: Instruction:')
  );
  const anchorLine =
    logs.find((line) => line.includes('AnchorError')) ||
    logs.find((line) => line.includes('Error Code')) ||
    logs.find((line) => line.includes('custom program error'));

  const parts = [instructionLine, anchorLine]
    .filter(Boolean)
    .map((line) => (line as string).replace(/^Program log:\s*/, '').trim());

  if (parts.length === 0) return null;
  return parts.join(' | ');
}

export async function sendInstructions(params: {
  connection: Connection;
  wallet: AnchorWallet;
  instructions: (TransactionInstruction | undefined)[];
}): Promise<string> {
  const { connection, wallet, instructions } = params;
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });

  const tx = new Transaction();
  instructions.filter(Boolean).forEach((ix) => {
    tx.add(ix as TransactionInstruction);
  });

  if (tx.instructions.length === 0) {
    throw new Error('No instructions to send');
  }

  tx.feePayer = wallet.publicKey;

  try {
    return await provider.sendAndConfirm(tx, []);
  } catch (error) {
    let logs: string[] | null | undefined;
    if (error instanceof SendTransactionError) {
      logs = await error.getLogs(connection);
      console.error('Transaction logs:', logs);
    } else if (error && typeof error === 'object' && 'logs' in error) {
      logs = (error as { logs?: string[] }).logs;
      console.error('Transaction logs:', logs);
    }

    const summary = formatTxLogSummary(logs);
    if (summary && error instanceof Error && !error.message.includes(summary)) {
      error.message = `${error.message} | ${summary}`;
    }
    throw error;
  }
}

export async function buildWrapSolInstructions(params: {
  connection: Connection;
  payer: PublicKey;
  owner: PublicKey;
  amountLamports: number;
}): Promise<{
  ata: PublicKey;
  instructions: TransactionInstruction[];
}> {
  const { connection, payer, owner, amountLamports } = params;

  if (!Number.isSafeInteger(amountLamports) || amountLamports <= 0) {
    throw new Error('Invalid wrap amount');
  }

  const { address: ata, instruction: ataIx } = await getOrCreateAtaIx({
    connection,
    payer,
    owner,
    mint: NATIVE_MINT,
  });

  const transferIx = SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: ata,
    lamports: amountLamports,
  });

  const syncIx = createSyncNativeInstruction(ata);

  return {
    ata,
    instructions: [ataIx, transferIx, syncIx].filter(
      (ix): ix is TransactionInstruction => Boolean(ix)
    ),
  };
}
