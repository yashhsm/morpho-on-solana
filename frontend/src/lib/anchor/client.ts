import { Program, AnchorProvider, Idl, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorWallet } from '@solana/wallet-adapter-react';
import { keccak256 } from 'js-sha3';
import IDL from './idl.json';

// Program ID from deployed contract
export const MORPHO_PROGRAM_ID = new PublicKey(
    '9qYe29CskmZ1mcuLLFcQXovfbqXBqLsXpg4y7Rfk9NsE'
);

// Seed constants (must match on-chain program constants)
export const PROGRAM_SEED_PREFIX = Buffer.from('morpho_v1');
export const PROTOCOL_STATE_SEED = Buffer.from('morpho_protocol');
export const MARKET_SEED = Buffer.from('morpho_market');
export const POSITION_SEED = Buffer.from('morpho_position');
export const LOAN_VAULT_SEED = Buffer.from('morpho_loan_vault');
export const COLLATERAL_VAULT_SEED = Buffer.from('morpho_collateral_vault');
export const AUTHORIZATION_SEED = Buffer.from('morpho_authorization');

export function getMorphoProgram(
    connection: Connection,
    wallet: AnchorWallet
): Program {
    const provider = new AnchorProvider(connection, wallet, {
        commitment: 'confirmed',
    });

    return new Program(IDL as Idl, provider);
}

// PDA Derivation Helpers
export function getProtocolStatePDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [PROGRAM_SEED_PREFIX, PROTOCOL_STATE_SEED],
        MORPHO_PROGRAM_ID
    );
}

export function getMarketPDA(marketId: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [PROGRAM_SEED_PREFIX, MARKET_SEED, marketId],
        MORPHO_PROGRAM_ID
    );
}

export function getPositionPDA(
    marketId: Buffer,
    owner: PublicKey
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [PROGRAM_SEED_PREFIX, POSITION_SEED, marketId, owner.toBuffer()],
        MORPHO_PROGRAM_ID
    );
}

export function getLoanVaultPDA(marketId: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [PROGRAM_SEED_PREFIX, LOAN_VAULT_SEED, marketId],
        MORPHO_PROGRAM_ID
    );
}

export function getCollateralVaultPDA(marketId: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [PROGRAM_SEED_PREFIX, COLLATERAL_VAULT_SEED, marketId],
        MORPHO_PROGRAM_ID
    );
}

export function getAuthorizationPDA(
    authorizer: PublicKey,
    authorized: PublicKey
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [
            PROGRAM_SEED_PREFIX,
            AUTHORIZATION_SEED,
            authorizer.toBuffer(),
            authorized.toBuffer(),
        ],
        MORPHO_PROGRAM_ID
    );
}

// Market ID calculation (keccak256 hash)
export function calculateMarketId(
    collateralMint: PublicKey,
    loanMint: PublicKey,
    oracle: PublicKey,
    irm: PublicKey,
    lltv: number
): Buffer {
    const lltvBuffer = new BN(lltv).toArrayLike(Buffer, 'le', 8);

    const data = Buffer.concat([
        collateralMint.toBuffer(),
        loanMint.toBuffer(),
        oracle.toBuffer(),
        irm.toBuffer(),
        lltvBuffer,
    ]);

    return Buffer.from(keccak256(data), 'hex');
}

// Utility to convert market ID to array for instruction
export function marketIdToArray(marketId: Buffer): number[] {
    return Array.from(marketId);
}
