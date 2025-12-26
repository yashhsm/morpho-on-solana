'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useProtocolState, useMarkets, useIsAdmin } from '@/lib/hooks/useOnChainData';
import { useEffect, useState } from 'react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { toast } from 'sonner';
import {
    calculateMarketId,
    getCollateralVaultPDA,
    getLoanVaultPDA,
    getMarketPDA,
    getMorphoProgram,
    getProtocolStatePDA,
} from '@/lib/anchor/client';
import {
    ensurePositionIx,
    getTokenProgramId,
    parseIntegerAmount,
    sendInstructions,
} from '@/lib/anchor/transactions';
import {
    Shield,
    AlertTriangle,
    CheckCircle,
    Lock,
    Unlock,
    Settings,
    DollarSign,
    Users,
    Pause,
    Play,
    ArrowRight,
    AlertCircle,
} from 'lucide-react';

function formatNumber(num: number): string {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
}

const DEFAULT_PUBKEY = new PublicKey('11111111111111111111111111111111');

function ProtocolNotInitialized({
    owner,
    feeRecipient,
    onOwnerChange,
    onFeeRecipientChange,
    onInitialize,
    submitting,
}: {
    owner: string;
    feeRecipient: string;
    onOwnerChange: (value: string) => void;
    onFeeRecipientChange: (value: string) => void;
    onInitialize: () => void;
    submitting: boolean;
}) {
    return (
        <div className="container py-16">
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                <div className="p-4 rounded-full bg-yellow-100 dark:bg-yellow-900">
                    <AlertCircle className="h-12 w-12 text-yellow-600" />
                </div>
                <h1 className="text-3xl font-bold">Protocol Not Initialized</h1>
                <p className="text-muted-foreground max-w-md">
                    The protocol has not been initialized yet. Use the <code className="bg-secondary px-2 py-1 rounded">initialize()</code> instruction to set up the protocol.
                </p>
                <Card className="w-full max-w-xl text-left">
                    <CardHeader>
                        <CardTitle>Initialize Protocol</CardTitle>
                        <CardDescription>
                            Sets the protocol owner and fee recipient. This can only be run once.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-sm font-medium">Owner Address</label>
                            <Input
                                value={owner}
                                onChange={(e) => onOwnerChange(e.target.value)}
                                placeholder="Owner public key"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Fee Recipient</label>
                            <Input
                                value={feeRecipient}
                                onChange={(e) => onFeeRecipientChange(e.target.value)}
                                placeholder="Fee recipient public key"
                                className="mt-1"
                            />
                        </div>
                        <Button className="w-full" onClick={onInitialize} disabled={!owner || !feeRecipient || submitting}>
                            {submitting ? 'Initializing...' : 'Initialize'}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default function AdminPage() {
    const { connected, publicKey } = useWallet();
    const wallet = useAnchorWallet();
    const { connection } = useConnection();
    const { data: protocolState, isLoading: protocolLoading } = useProtocolState();
    const { data: markets, isLoading: marketsLoading } = useMarkets();
    const isAdmin = useIsAdmin();

    const [pendingAction, setPendingAction] = useState<string | null>(null);

    const [initOwner, setInitOwner] = useState('');
    const [initFeeRecipient, setInitFeeRecipient] = useState('');
    const [newOwner, setNewOwner] = useState('');
    const [newFeeRecipient, setNewFeeRecipient] = useState('');
    const [newLltv, setNewLltv] = useState('');
    const [newIrm, setNewIrm] = useState('');
    const [marketFeeInputs, setMarketFeeInputs] = useState<Record<string, string>>({});

    const [createCollateralMint, setCreateCollateralMint] = useState('');
    const [createLoanMint, setCreateLoanMint] = useState('');
    const [createOracle, setCreateOracle] = useState('');
    const [createIrm, setCreateIrm] = useState('');
    const [createLltv, setCreateLltv] = useState('');

    useEffect(() => {
        if (publicKey) {
            setInitOwner((prev) => prev || publicKey.toString());
            setInitFeeRecipient((prev) => prev || publicKey.toString());
        }
    }, [publicKey]);

    const requireWallet = () => {
        if (!wallet || !publicKey) {
            toast.error('Connect a wallet to continue');
            return false;
        }
        return true;
    };

    const parsePubkey = (value: string, label: string): PublicKey => {
        const trimmed = value.trim();
        if (!trimmed) {
            throw new Error(`${label} is required`);
        }
        try {
            return new PublicKey(trimmed);
        } catch (error) {
            throw new Error(`Invalid ${label} public key`);
        }
    };

    const handleInitialize = async () => {
        if (!requireWallet()) return;
        setPendingAction('initialize');
        const toastId = toast.loading('Initializing protocol...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const [protocolStatePda] = getProtocolStatePDA();
            const owner = parsePubkey(initOwner, 'Owner');
            const feeRecipient = parsePubkey(initFeeRecipient, 'Fee recipient');

            const signature = await program.methods
                .initialize(owner, feeRecipient)
                .accounts({
                    payer: wallet.publicKey,
                    protocolState: protocolStatePda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            toast.success('Protocol initialized', { id: toastId, description: signature });
        } catch (error) {
            toast.error('Initialization failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleTransferOwnership = async () => {
        if (!requireWallet() || !newOwner) return;
        setPendingAction('transfer_ownership');
        const toastId = toast.loading('Transferring ownership...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const [protocolStatePda] = getProtocolStatePDA();
            const newOwnerKey = parsePubkey(newOwner, 'New owner');

            const signature = await program.methods
                .transferOwnership(newOwnerKey)
                .accounts({
                    owner: wallet.publicKey,
                    protocolState: protocolStatePda,
                })
                .rpc();

            toast.success('Ownership transfer started', { id: toastId, description: signature });
            setNewOwner('');
        } catch (error) {
            toast.error('Ownership transfer failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleAcceptOwnership = async () => {
        if (!requireWallet()) return;
        setPendingAction('accept_ownership');
        const toastId = toast.loading('Accepting ownership...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const [protocolStatePda] = getProtocolStatePDA();

            const signature = await program.methods
                .acceptOwnership()
                .accounts({
                    pendingOwner: wallet.publicKey,
                    protocolState: protocolStatePda,
                })
                .rpc();

            toast.success('Ownership accepted', { id: toastId, description: signature });
        } catch (error) {
            toast.error('Accept ownership failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleSetFeeRecipient = async () => {
        if (!requireWallet() || !newFeeRecipient) return;
        setPendingAction('set_fee_recipient');
        const toastId = toast.loading('Updating fee recipient...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const [protocolStatePda] = getProtocolStatePDA();
            const recipient = parsePubkey(newFeeRecipient, 'Fee recipient');

            const signature = await program.methods
                .setFeeRecipient(recipient)
                .accounts({
                    owner: wallet.publicKey,
                    protocolState: protocolStatePda,
                })
                .rpc();

            toast.success('Fee recipient updated', { id: toastId, description: signature });
            setNewFeeRecipient('');
        } catch (error) {
            toast.error('Fee recipient update failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleToggleProtocolPause = async () => {
        if (!requireWallet() || !protocolState) return;
        setPendingAction('set_protocol_paused');
        const toastId = toast.loading(protocolState.paused ? 'Unpausing protocol...' : 'Pausing protocol...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const [protocolStatePda] = getProtocolStatePDA();

            const signature = await program.methods
                .setProtocolPaused(!protocolState.paused)
                .accounts({
                    owner: wallet.publicKey,
                    protocolState: protocolStatePda,
                })
                .rpc();

            toast.success('Protocol pause updated', { id: toastId, description: signature });
        } catch (error) {
            toast.error('Protocol pause failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleEnableLltv = async () => {
        if (!requireWallet() || !newLltv) return;
        setPendingAction('enable_lltv');
        const toastId = toast.loading('Enabling LLTV...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const [protocolStatePda] = getProtocolStatePDA();
            const lltv = parseIntegerAmount(newLltv.trim());

            const signature = await program.methods
                .enableLltv(lltv)
                .accounts({
                    owner: wallet.publicKey,
                    protocolState: protocolStatePda,
                })
                .rpc();

            toast.success('LLTV enabled', { id: toastId, description: signature });
            setNewLltv('');
        } catch (error) {
            toast.error('Enable LLTV failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleEnableIrm = async () => {
        if (!requireWallet() || !newIrm) return;
        setPendingAction('enable_irm');
        const toastId = toast.loading('Enabling IRM...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const [protocolStatePda] = getProtocolStatePDA();
            const irm = parsePubkey(newIrm, 'IRM');

            const signature = await program.methods
                .enableIrm(irm)
                .accounts({
                    owner: wallet.publicKey,
                    protocolState: protocolStatePda,
                })
                .rpc();

            toast.success('IRM enabled', { id: toastId, description: signature });
            setNewIrm('');
        } catch (error) {
            toast.error('Enable IRM failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleCreateMarket = async () => {
        if (!requireWallet()) return;
        if (!createCollateralMint || !createLoanMint || !createOracle || !createIrm || !createLltv) return;
        setPendingAction('create_market');
        const toastId = toast.loading('Creating market...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const [protocolStatePda] = getProtocolStatePDA();
            const collateralMint = parsePubkey(createCollateralMint, 'Collateral mint');
            const loanMint = parsePubkey(createLoanMint, 'Loan mint');
            const oracle = parsePubkey(createOracle, 'Oracle');
            const irm = parsePubkey(createIrm, 'IRM');
            const lltvValue = Number(createLltv.trim());
            const marketId = calculateMarketId(collateralMint, loanMint, oracle, irm, lltvValue);
            const [marketPda] = getMarketPDA(marketId);
            const [collateralVault] = getCollateralVaultPDA(marketId);
            const [loanVault] = getLoanVaultPDA(marketId);

            const collateralTokenProgram = await getTokenProgramId(connection, collateralMint);
            const loanTokenProgram = await getTokenProgramId(connection, loanMint);
            if (!collateralTokenProgram.equals(loanTokenProgram)) {
                throw new Error('Collateral and loan mints use different token programs');
            }

            const signature = await program.methods
                .createMarket(collateralMint, loanMint, oracle, irm, parseIntegerAmount(createLltv.trim()))
                .accounts({
                    creator: wallet.publicKey,
                    protocolState: protocolStatePda,
                    market: marketPda,
                    collateralMint,
                    loanMint,
                    collateralVault,
                    loanVault,
                    oracle,
                    irm,
                    tokenProgram: loanTokenProgram,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            toast.success('Market created', { id: toastId, description: signature });
            setCreateCollateralMint('');
            setCreateLoanMint('');
            setCreateOracle('');
            setCreateIrm('');
            setCreateLltv('');
        } catch (error) {
            toast.error('Create market failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleToggleMarketPause = async (market: NonNullable<typeof markets>[number]) => {
        if (!requireWallet()) return;
        setPendingAction(`pause_${market.publicKey.toString()}`);
        const toastId = toast.loading(market.account.paused ? 'Unpausing market...' : 'Pausing market...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const [protocolStatePda] = getProtocolStatePDA();
            const marketId = Buffer.from(market.account.marketId);
            const signature = await program.methods
                .setMarketPaused(Array.from(marketId), !market.account.paused)
                .accounts({
                    owner: wallet.publicKey,
                    protocolState: protocolStatePda,
                    market: market.publicKey,
                })
                .rpc();

            toast.success('Market pause updated', { id: toastId, description: signature });
        } catch (error) {
            toast.error('Market pause failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleSetMarketFee = async (market: NonNullable<typeof markets>[number], feeValue: string) => {
        if (!requireWallet() || !feeValue) return;
        setPendingAction(`fee_${market.publicKey.toString()}`);
        const toastId = toast.loading('Setting market fee...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const [protocolStatePda] = getProtocolStatePDA();
            const marketId = Buffer.from(market.account.marketId);

            const signature = await program.methods
                .setFee(Array.from(marketId), parseIntegerAmount(feeValue))
                .accounts({
                    owner: wallet.publicKey,
                    protocolState: protocolStatePda,
                    market: market.publicKey,
                })
                .rpc();

            toast.success('Market fee updated', { id: toastId, description: signature });
            setMarketFeeInputs((prev) => ({ ...prev, [market.publicKey.toString()]: '' }));
        } catch (error) {
            toast.error('Set fee failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleClaimFees = async (market: NonNullable<typeof markets>[number]) => {
        if (!requireWallet() || !protocolState) return;
        setPendingAction(`claim_${market.publicKey.toString()}`);
        const toastId = toast.loading('Claiming fees...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const [protocolStatePda] = getProtocolStatePDA();
            const marketId = Buffer.from(market.account.marketId);

            const { positionPda, instruction: positionIx } = await ensurePositionIx({
                connection,
                program,
                marketId,
                market: market.publicKey,
                owner: protocolState.feeRecipient,
                payer: wallet.publicKey,
            });

            const claimIx = await program.methods
                .claimFees(Array.from(marketId))
                .accounts({
                    protocolState: protocolStatePda,
                    market: market.publicKey,
                    feePosition: positionPda,
                })
                .instruction();

            const signature = await sendInstructions({
                connection,
                wallet,
                instructions: [positionIx, claimIx],
            });

            toast.success('Fees claimed', { id: toastId, description: signature });
        } catch (error) {
            toast.error('Claim fees failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    const handleAccrueInterest = async (market: NonNullable<typeof markets>[number]) => {
        if (!requireWallet()) return;
        setPendingAction(`accrue_${market.publicKey.toString()}`);
        const toastId = toast.loading('Accruing interest...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const marketId = Buffer.from(market.account.marketId);

            const signature = await program.methods
                .accrueInterest(Array.from(marketId))
                .accounts({
                    market: market.publicKey,
                })
                .rpc();

            toast.success('Interest accrued', { id: toastId, description: signature });
        } catch (error) {
            toast.error('Accrue interest failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAction(null);
        }
    };

    if (!connected) {
        return (
            <div className="container py-16">
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                    <div className="p-4 rounded-full bg-secondary">
                        <Lock className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <h1 className="text-3xl font-bold">Admin Access Required</h1>
                    <p className="text-muted-foreground max-w-md">
                        Connect your wallet to access the admin panel. Only the protocol owner can manage settings.
                    </p>
                    <WalletMultiButton />
                </div>
            </div>
        );
    }

    if (protocolLoading) {
        return (
            <div className="container py-8">
                <div className="space-y-6">
                    <Skeleton className="h-12 w-64" />
                    <div className="grid md:grid-cols-2 gap-6">
                        <Skeleton className="h-64" />
                        <Skeleton className="h-64" />
                    </div>
                </div>
            </div>
        );
    }

    if (!protocolState) {
        return (
            <ProtocolNotInitialized
                owner={initOwner}
                feeRecipient={initFeeRecipient}
                onOwnerChange={setInitOwner}
                onFeeRecipientChange={setInitFeeRecipient}
                onInitialize={handleInitialize}
                submitting={pendingAction === 'initialize'}
            />
        );
    }

    if (isAdmin === false) {
        const isPendingOwnerView =
            !!publicKey &&
            !protocolState.pendingOwner.equals(DEFAULT_PUBKEY) &&
            publicKey.equals(protocolState.pendingOwner);

        if (isPendingOwnerView) {
            return (
                <div className="container py-16">
                    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                        <div className="p-4 rounded-full bg-yellow-100 dark:bg-yellow-900">
                            <AlertTriangle className="h-12 w-12 text-yellow-600" />
                        </div>
                        <h1 className="text-3xl font-bold">Ownership Acceptance</h1>
                        <p className="text-muted-foreground max-w-md">
                            You are the pending owner. Accept ownership to gain admin access.
                        </p>
                        <Button onClick={handleAcceptOwnership} disabled={pendingAction === 'accept_ownership'}>
                            {pendingAction === 'accept_ownership' ? 'Accepting...' : 'Accept Ownership'}
                        </Button>
                    </div>
                </div>
            );
        }

        return (
            <div className="container py-16">
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                    <div className="p-4 rounded-full bg-red-100 dark:bg-red-900">
                        <AlertTriangle className="h-12 w-12 text-red-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-red-600">Access Denied</h1>
                    <p className="text-muted-foreground max-w-md">
                        Your wallet is not the protocol owner. Only the owner can access this page.
                    </p>
                    <div className="text-sm font-mono bg-secondary px-4 py-2 rounded">
                        Owner: {protocolState.owner.toString().slice(0, 8)}...{protocolState.owner.toString().slice(-8)}
                    </div>
                </div>
            </div>
        );
    }

    const hasPendingOwner = !protocolState.pendingOwner.equals(DEFAULT_PUBKEY);
    const isPendingOwner = hasPendingOwner && !!publicKey && publicKey.equals(protocolState.pendingOwner);
    const marketIdPreview = (() => {
        const trimmedCollateral = createCollateralMint.trim();
        const trimmedLoan = createLoanMint.trim();
        const trimmedOracle = createOracle.trim();
        const trimmedIrm = createIrm.trim();
        const trimmedLltv = createLltv.trim();

        if (!trimmedCollateral || !trimmedLoan || !trimmedOracle || !trimmedIrm || !trimmedLltv) {
            return { id: null, error: null };
        }

        try {
            const marketId = calculateMarketId(
                new PublicKey(trimmedCollateral),
                new PublicKey(trimmedLoan),
                new PublicKey(trimmedOracle),
                new PublicKey(trimmedIrm),
                Number(trimmedLltv)
            );
            return { id: Buffer.from(marketId).toString('hex'), error: null };
        } catch (error) {
            return { id: null, error: 'Invalid public key input' };
        }
    })();

    return (
        <div className="container py-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <Shield className="w-8 h-8 text-indigo-600" />
                        Admin Panel
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Manage protocol settings, markets, and whitelists
                    </p>
                </div>
                <Badge variant="default" className="px-4 py-2 bg-green-600">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Owner Access
                </Badge>
            </div>

            <Tabs defaultValue="protocol" className="space-y-8">
                <TabsList className="w-full justify-start">
                    <TabsTrigger value="protocol">Protocol</TabsTrigger>
                    <TabsTrigger value="markets">Markets</TabsTrigger>
                    <TabsTrigger value="whitelist">Whitelist</TabsTrigger>
                </TabsList>

                {/* Protocol Tab */}
                <TabsContent value="protocol" className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Ownership */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Users className="w-5 h-5" />
                                    Ownership Management
                                </CardTitle>
                                <CardDescription>
                                    Instructions: transfer_ownership(), accept_ownership()
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Current Owner</span>
                                        <span className="font-mono text-xs">{protocolState.owner.toString().slice(0, 12)}...</span>
                                    </div>
                                    {hasPendingOwner && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Pending Owner</span>
                                            <span className="font-mono text-orange-600 text-xs">{protocolState.pendingOwner.toString().slice(0, 12)}...</span>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Transfer Ownership To</label>
                                    <Input
                                        value={newOwner}
                                        onChange={(e) => setNewOwner(e.target.value)}
                                        placeholder="Enter new owner address"
                                        className="mt-1"
                                    />
                                </div>

                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Two-Step Transfer</AlertTitle>
                                    <AlertDescription>
                                        New owner must call accept_ownership() to complete transfer.
                                    </AlertDescription>
                                </Alert>

                                <Button
                                    className="w-full"
                                    disabled={!newOwner || pendingAction === 'transfer_ownership'}
                                    onClick={handleTransferOwnership}
                                >
                                    <ArrowRight className="w-4 h-4 mr-2" />
                                    {pendingAction === 'transfer_ownership' ? 'Transferring...' : 'Transfer Ownership'}
                                </Button>
                                {isPendingOwner && (
                                    <Button
                                        className="w-full"
                                        variant="outline"
                                        onClick={handleAcceptOwnership}
                                        disabled={pendingAction === 'accept_ownership'}
                                    >
                                        {pendingAction === 'accept_ownership' ? 'Accepting...' : 'Accept Ownership'}
                                    </Button>
                                )}
                            </CardContent>
                        </Card>

                        {/* Fee Recipient */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <DollarSign className="w-5 h-5" />
                                    Fee Recipient
                                </CardTitle>
                                <CardDescription>
                                    Instruction: set_fee_recipient()
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Current Recipient</span>
                                    <span className="font-mono text-xs">{protocolState.feeRecipient.toString().slice(0, 12)}...</span>
                                </div>

                                <div>
                                    <label className="text-sm font-medium">New Fee Recipient</label>
                                    <Input
                                        value={newFeeRecipient}
                                        onChange={(e) => setNewFeeRecipient(e.target.value)}
                                        placeholder="Enter new fee recipient address"
                                        className="mt-1"
                                    />
                                </div>

                                <Button
                                    className="w-full"
                                    variant="outline"
                                    disabled={!newFeeRecipient || pendingAction === 'set_fee_recipient'}
                                    onClick={handleSetFeeRecipient}
                                >
                                    <Settings className="w-4 h-4 mr-2" />
                                    {pendingAction === 'set_fee_recipient' ? 'Updating...' : 'Update Fee Recipient'}
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Protocol Pause */}
                        <Card className="md:col-span-2">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    {protocolState.paused ? <Pause className="w-5 h-5 text-red-500" /> : <Play className="w-5 h-5 text-green-500" />}
                                    Protocol Emergency Pause
                                </CardTitle>
                                <CardDescription>
                                    Instruction: set_protocol_paused()
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Protocol Status</p>
                                        <p className="text-sm text-muted-foreground">
                                            {protocolState.paused
                                                ? 'Protocol is PAUSED. All operations are blocked.'
                                                : 'Protocol is ACTIVE. All operations are allowed.'}
                                        </p>
                                    </div>
                                    <Button
                                        variant={protocolState.paused ? 'default' : 'destructive'}
                                        onClick={handleToggleProtocolPause}
                                        disabled={pendingAction === 'set_protocol_paused'}
                                    >
                                        {protocolState.paused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                                        {pendingAction === 'set_protocol_paused'
                                            ? 'Updating...'
                                            : protocolState.paused
                                                ? 'Unpause Protocol'
                                                : 'Pause Protocol'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Markets Tab */}
                <TabsContent value="markets" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Create Market</CardTitle>
                            <CardDescription>
                                Instruction: create_market() - Requires whitelisted LLTV and IRM.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium">Collateral Mint</label>
                                    <Input
                                        value={createCollateralMint}
                                        onChange={(e) => setCreateCollateralMint(e.target.value)}
                                        placeholder="Collateral mint address"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Loan Mint</label>
                                    <Input
                                        value={createLoanMint}
                                        onChange={(e) => setCreateLoanMint(e.target.value)}
                                        placeholder="Loan mint address"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Oracle Account</label>
                                    <Input
                                        value={createOracle}
                                        onChange={(e) => setCreateOracle(e.target.value)}
                                        placeholder="Oracle address"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">IRM Account</label>
                                    <Input
                                        value={createIrm}
                                        onChange={(e) => setCreateIrm(e.target.value)}
                                        placeholder="IRM address"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">LLTV (BPS)</label>
                                    <Input
                                        type="number"
                                        value={createLltv}
                                        onChange={(e) => setCreateLltv(e.target.value)}
                                        placeholder="e.g., 8500"
                                        className="mt-1"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Computed Market ID</label>
                                    <Input
                                        value={marketIdPreview.id ? `${marketIdPreview.id.slice(0, 16)}...` : ''}
                                        placeholder="Fill inputs to compute"
                                        className="mt-1"
                                        readOnly
                                    />
                                    {marketIdPreview.error && (
                                        <div className="text-xs text-red-600 mt-1">{marketIdPreview.error}</div>
                                    )}
                                </div>
                            </div>
                            <Button
                                className="w-full"
                                onClick={handleCreateMarket}
                                disabled={
                                    pendingAction === 'create_market' ||
                                    !createCollateralMint ||
                                    !createLoanMint ||
                                    !createOracle ||
                                    !createIrm ||
                                    !createLltv
                                }
                            >
                                {pendingAction === 'create_market' ? 'Creating...' : 'Create Market'}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Market Management</CardTitle>
                            <CardDescription>
                                Instructions: set_market_paused(), set_fee(), claim_fees()
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {marketsLoading ? (
                                <div className="space-y-4">
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                </div>
                            ) : markets && markets.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Market</TableHead>
                                            <TableHead>Fee (BPS)</TableHead>
                                            <TableHead>Total Supply</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Update Fee</TableHead>
                                            <TableHead>Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {markets.map((market) => (
                                            <TableRow key={market.publicKey.toString()}>
                                                <TableCell className="font-mono text-xs">{market.publicKey.toString().slice(0, 12)}...</TableCell>
                                                <TableCell>{(market.account.fee / 100).toFixed(2)}%</TableCell>
                                                <TableCell className="text-green-600 font-semibold">
                                                    {formatNumber(Number(market.account.totalSupplyAssets) / Math.pow(10, market.account.loanDecimals))}
                                                </TableCell>
                                                <TableCell>
                                                    {market.account.paused ? (
                                                        <Badge variant="destructive"><Lock className="w-3 h-3 mr-1" />Paused</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-green-600"><Unlock className="w-3 h-3 mr-1" />Active</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-2">
                                                        <Input
                                                            type="number"
                                                            value={marketFeeInputs[market.publicKey.toString()] || ''}
                                                            onChange={(e) =>
                                                                setMarketFeeInputs((prev) => ({
                                                                    ...prev,
                                                                    [market.publicKey.toString()]: e.target.value,
                                                                }))
                                                            }
                                                            placeholder="BPS"
                                                            className="h-8 w-24"
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={
                                                                !marketFeeInputs[market.publicKey.toString()] ||
                                                                pendingAction === `fee_${market.publicKey.toString()}`
                                                            }
                                                            onClick={() =>
                                                                handleSetMarketFee(
                                                                    market,
                                                                    marketFeeInputs[market.publicKey.toString()]
                                                                )
                                                            }
                                                        >
                                                            {pendingAction === `fee_${market.publicKey.toString()}` ? '...' : 'Set'}
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant={market.account.paused ? 'default' : 'outline'}
                                                            onClick={() => handleToggleMarketPause(market)}
                                                            disabled={pendingAction === `pause_${market.publicKey.toString()}`}
                                                        >
                                                            {pendingAction === `pause_${market.publicKey.toString()}`
                                                                ? '...'
                                                                : market.account.paused
                                                                    ? 'Unpause'
                                                                    : 'Pause'}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleAccrueInterest(market)}
                                                            disabled={pendingAction === `accrue_${market.publicKey.toString()}`}
                                                        >
                                                            {pendingAction === `accrue_${market.publicKey.toString()}` ? 'Accruing' : 'Accrue'}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleClaimFees(market)}
                                                            disabled={pendingAction === `claim_${market.publicKey.toString()}`}
                                                        >
                                                            <DollarSign className="w-3 h-3 mr-1" />
                                                            {pendingAction === `claim_${market.publicKey.toString()}` ? 'Claiming' : 'Claim'}
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>No markets have been created yet</p>
                                    <p className="text-sm mt-2">Use create_market() to create the first market</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Whitelist Tab */}
                <TabsContent value="whitelist" className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* LLTV Whitelist */}
                        <Card>
                            <CardHeader>
                                <CardTitle>LLTV Whitelist</CardTitle>
                                <CardDescription>
                                    Instruction: enable_lltv()
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="text-sm text-muted-foreground">
                                    Enabled LLTVs are stored on-chain. Query the protocol to see current values.
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Add New LLTV (BPS, e.g., 8500 = 85%)</label>
                                    <div className="flex gap-2 mt-1">
                                        <Input
                                            type="number"
                                            value={newLltv}
                                            onChange={(e) => setNewLltv(e.target.value)}
                                            placeholder="e.g., 8500"
                                        />
                                        <Button
                                            disabled={!newLltv || pendingAction === 'enable_lltv'}
                                            onClick={handleEnableLltv}
                                        >
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            {pendingAction === 'enable_lltv' ? 'Enabling...' : 'Enable'}
                                        </Button>
                                    </div>
                                </div>

                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Note</AlertTitle>
                                    <AlertDescription>
                                        LLTVs cannot be disabled once enabled. Max 10 LLTVs allowed.
                                    </AlertDescription>
                                </Alert>
                            </CardContent>
                        </Card>

                        {/* IRM Whitelist */}
                        <Card>
                            <CardHeader>
                                <CardTitle>IRM Whitelist</CardTitle>
                                <CardDescription>
                                    Instruction: enable_irm()
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="text-sm text-muted-foreground">
                                    Enabled IRMs are stored on-chain. Query the protocol to see current values.
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Add New IRM Address</label>
                                    <div className="flex gap-2 mt-1">
                                        <Input
                                            value={newIrm}
                                            onChange={(e) => setNewIrm(e.target.value)}
                                            placeholder="Enter IRM account address"
                                        />
                                        <Button
                                            disabled={!newIrm || pendingAction === 'enable_irm'}
                                            onClick={handleEnableIrm}
                                        >
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            {pendingAction === 'enable_irm' ? 'Enabling...' : 'Enable'}
                                        </Button>
                                    </div>
                                </div>

                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Note</AlertTitle>
                                    <AlertDescription>
                                        IRMs cannot be disabled once enabled. Max 5 IRMs allowed.
                                    </AlertDescription>
                                </Alert>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
