'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useUserPositions, useMarkets } from '@/lib/hooks/useOnChainData';
import Link from 'next/link';
import { useState } from 'react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { toast } from 'sonner';
import { getAuthorizationPDA, getMorphoProgram } from '@/lib/anchor/client';
import { parseIntegerAmount } from '@/lib/anchor/transactions';
import {
    Wallet,
    TrendingUp,
    TrendingDown,
    Shield,
    DollarSign,
    ArrowRight,
} from 'lucide-react';

function PositionsSkeleton() {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </div>
            </CardContent>
        </Card>
    );
}

function EmptyPositionsState() {
    return (
        <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="p-4 rounded-full bg-secondary mb-4">
                    <Wallet className="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No Positions Yet</h3>
                <p className="text-muted-foreground max-w-md mb-6">
                    You don't have any lending positions. Visit the Markets page to supply assets or deposit collateral.
                </p>
                <Button asChild>
                    <Link href="/markets">
                        Explore Markets
                        <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}

export default function DashboardPage() {
    const { connected, publicKey } = useWallet();
    const wallet = useAnchorWallet();
    const { connection } = useConnection();
    const { data: positions, isLoading: positionsLoading } = useUserPositions();
    const { data: markets } = useMarkets();
    const [pendingClose, setPendingClose] = useState<string | null>(null);
    const [authorizedAddress, setAuthorizedAddress] = useState('');
    const [authorizationExpiry, setAuthorizationExpiry] = useState('');
    const [authorizationEnabled, setAuthorizationEnabled] = useState(true);
    const [pendingAuthorization, setPendingAuthorization] = useState<string | null>(null);

    const handleClosePosition = async (positionKey: string, marketId: number[]) => {
        if (!wallet || !publicKey) return;
        setPendingClose(positionKey);
        const toastId = toast.loading('Closing position...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const signature = await program.methods
                .closePosition(marketId)
                .accounts({
                    owner: wallet.publicKey,
                    rentReceiver: wallet.publicKey,
                    position: new PublicKey(positionKey),
                })
                .rpc();

            toast.success('Position closed', { id: toastId, description: signature });
        } catch (error) {
            toast.error('Close position failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingClose(null);
        }
    };

    const handleSetAuthorization = async () => {
        if (!wallet || !publicKey || !authorizedAddress) return;
        setPendingAuthorization('set');
        const toastId = toast.loading('Setting authorization...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const authorized = new PublicKey(authorizedAddress.trim());
            const [authorizationPda] = getAuthorizationPDA(wallet.publicKey, authorized);
            const expiresAt = authorizationExpiry ? parseIntegerAmount(authorizationExpiry.trim()) : parseIntegerAmount('0');

            const signature = await program.methods
                .setAuthorization(authorizationEnabled, expiresAt)
                .accounts({
                    authorizer: wallet.publicKey,
                    authorized,
                    authorization: authorizationPda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            toast.success('Authorization updated', { id: toastId, description: signature });
        } catch (error) {
            toast.error('Authorization failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAuthorization(null);
        }
    };

    const handleRevokeAuthorization = async () => {
        if (!wallet || !publicKey || !authorizedAddress) return;
        setPendingAuthorization('revoke');
        const toastId = toast.loading('Revoking authorization...');

        try {
            const program = getMorphoProgram(connection, wallet);
            const authorized = new PublicKey(authorizedAddress.trim());
            const [authorizationPda] = getAuthorizationPDA(wallet.publicKey, authorized);

            const signature = await program.methods
                .revokeAuthorization()
                .accounts({
                    authorizer: wallet.publicKey,
                    authorization: authorizationPda,
                })
                .rpc();

            toast.success('Authorization revoked', { id: toastId, description: signature });
        } catch (error) {
            toast.error('Revoke failed', {
                id: toastId,
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setPendingAuthorization(null);
        }
    };

    if (!connected) {
        return (
            <div className="container py-16">
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                    <div className="p-4 rounded-full bg-secondary">
                        <Wallet className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <h1 className="text-3xl font-bold">Connect Your Wallet</h1>
                    <p className="text-muted-foreground max-w-md">
                        Connect your wallet to view your positions, manage collateral, and track your earnings.
                    </p>
                    <WalletMultiButton style={{
                        backgroundColor: '#6366F1',
                        borderRadius: '0.5rem',
                        fontSize: '1rem',
                        padding: '1rem 2rem',
                    }} />
                </div>
            </div>
        );
    }

    // Calculate totals from real positions
    const totalSupplyShares = positions?.reduce((acc, p) => acc + Number(p.account.supplyShares), 0) || 0;
    const totalBorrowShares = positions?.reduce((acc, p) => acc + Number(p.account.borrowShares), 0) || 0;
    const totalCollateral = positions?.reduce((acc, p) => acc + Number(p.account.collateral), 0) || 0;

    return (
        <div className="container py-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground mt-2 font-mono text-sm">
                        {publicKey?.toString().slice(0, 8)}...{publicKey?.toString().slice(-8)}
                    </p>
                </div>
                <Badge variant="outline" className="px-4 py-2">
                    <Shield className="w-4 h-4 mr-2 text-green-500" />
                    {positions?.length || 0} Positions
                </Badge>
            </div>

            {/* Summary Cards */}
            <div className="grid md:grid-cols-4 gap-4 mb-8">
                <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium opacity-90 flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            Total Positions
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{positions?.length || 0}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            Supply Shares
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {positionsLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <div className="text-2xl font-bold text-green-600">
                                {(totalSupplyShares / 1e9).toFixed(2)}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <TrendingDown className="w-4 h-4" />
                            Borrow Shares
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {positionsLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <div className="text-2xl font-bold text-orange-600">
                                {(totalBorrowShares / 1e9).toFixed(2)}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Collateral
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {positionsLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <div className="text-2xl font-bold">{(totalCollateral / 1e9).toFixed(4)}</div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Positions Table */}
            {positionsLoading ? (
                <PositionsSkeleton />
            ) : positions && positions.length > 0 ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Your Positions</CardTitle>
                        <CardDescription>Manage your lending and borrowing positions</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Market</TableHead>
                                    <TableHead>Supply Shares</TableHead>
                                    <TableHead>Collateral</TableHead>
                                    <TableHead>Borrow Shares</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {positions.map((position) => {
                                    // Find matching market
                                    const market = markets?.find(m => {
                                        const posIdHex = Buffer.from(position.account.marketId).toString('hex');
                                        const marketIdHex = Buffer.from(m.account.marketId).toString('hex');
                                        return posIdHex === marketIdHex;
                                    });

                                    return (
                                        <TableRow key={position.publicKey.toString()}>
                                            <TableCell className="font-mono text-sm">
                                                {market ? market.publicKey.toString().slice(0, 8) : 'Unknown'}...
                                            </TableCell>
                                            <TableCell className="text-green-600 font-semibold">
                                                {(Number(position.account.supplyShares) / 1e9).toFixed(4)}
                                            </TableCell>
                                            <TableCell>
                                                {(Number(position.account.collateral) / 1e9).toFixed(6)}
                                            </TableCell>
                                            <TableCell className="text-orange-600 font-semibold">
                                                {(Number(position.account.borrowShares) / 1e9).toFixed(4)}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-2">
                                                    {market && (
                                                        <Button variant="ghost" size="sm" asChild>
                                                            <Link href={`/markets/${market.publicKey.toString()}`}>
                                                                Manage
                                                                <ArrowRight className="w-4 h-4 ml-2" />
                                                            </Link>
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={
                                                            pendingClose === position.publicKey.toString() ||
                                                            Number(position.account.supplyShares) > 0 ||
                                                            Number(position.account.borrowShares) > 0 ||
                                                            Number(position.account.collateral) > 0
                                                        }
                                                        onClick={() =>
                                                            handleClosePosition(
                                                                position.publicKey.toString(),
                                                                position.account.marketId
                                                            )
                                                        }
                                                    >
                                                        {pendingClose === position.publicKey.toString() ? 'Closing...' : 'Close'}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            ) : (
                <EmptyPositionsState />
            )}

            <Card className="mt-8">
                <CardHeader>
                    <CardTitle>Delegated Authorization</CardTitle>
                    <CardDescription>
                        Allow another wallet to manage your positions with set_authorization() / revoke_authorization().
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="text-sm font-medium">Authorized Wallet</label>
                        <Input
                            value={authorizedAddress}
                            onChange={(e) => setAuthorizedAddress(e.target.value)}
                            placeholder="Wallet address to authorize"
                            className="mt-1"
                        />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm font-medium">Expires At (Unix Timestamp)</label>
                            <Input
                                value={authorizationExpiry}
                                onChange={(e) => setAuthorizationExpiry(e.target.value)}
                                placeholder="0 for no expiry"
                                className="mt-1"
                            />
                        </div>
                        <div className="flex items-center gap-2 pt-6">
                            <input
                                id="auth-enabled"
                                type="checkbox"
                                checked={authorizationEnabled}
                                onChange={(e) => setAuthorizationEnabled(e.target.checked)}
                            />
                            <label htmlFor="auth-enabled" className="text-sm font-medium">
                                Enable Authorization
                            </label>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={handleSetAuthorization}
                            disabled={!authorizedAddress || pendingAuthorization === 'set'}
                        >
                            {pendingAuthorization === 'set' ? 'Saving...' : 'Set Authorization'}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={handleRevokeAuthorization}
                            disabled={!authorizedAddress || pendingAuthorization === 'revoke'}
                        >
                            {pendingAuthorization === 'revoke' ? 'Revoking...' : 'Revoke Authorization'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
