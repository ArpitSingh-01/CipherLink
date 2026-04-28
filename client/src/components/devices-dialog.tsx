import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Tablet, Smartphone, Laptop, Trash2, CheckCircle2, UserPlus, X, Check, Link, RefreshCw } from 'lucide-react';
import { getActiveDevices, revokeDevice } from '@/lib/devices';
import { getDeviceIdentity, getIdentity } from '@/lib/storage';
import { formatDistanceToNow } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import { hexToBytes, bytesToHex, encryptWithSecret, hkdf } from '@/lib/crypto';

export function DevicesDialog() {
    const [devices, setDevices] = useState<any[]>([]);
    const [currentDeviceKey, setCurrentDeviceKey] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isRevoking, setIsRevoking] = useState<string | null>(null);
    const [linkingRequests, setLinkingRequests] = useState<any[]>([]);
    const [isApproving, setIsApproving] = useState<string | null>(null);
    const { toast } = useToast();

    const fetchLinkingRequests = async () => {
        try {
            const res = await apiRequest('GET', '/api/link/requests');
            if (res.ok) {
                const data = await res.json();
                setLinkingRequests(data);
            }
        } catch (e) {
            console.error("Failed to fetch linking requests:", e);
        }
    };

    const fetchDevices = async () => {
        setLoading(true);
        try {
            const data = await getActiveDevices();
            setDevices(data);

            const current = await getDeviceIdentity();
            if (current) {
                setCurrentDeviceKey(current.publicKey);
            }
            await fetchLinkingRequests();
        } catch (error) {
            console.error('Failed to fetch devices:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRevoke = async (devicePublicKey: string) => {
        setIsRevoking(devicePublicKey);
        try {
            await revokeDevice(devicePublicKey);
            toast({
                title: 'Device Revoked',
                description: 'The device has been successfully revoked access.',
            });
            fetchDevices();
        } catch (error) {
            toast({
                title: 'Error Revoking Device',
                description: error instanceof Error ? error.message : 'Failed to revoke device',
                variant: 'destructive',
            });
        } finally {
            setIsRevoking(null);
        }
    };

    const handleApprove = async (request: any) => {
        setIsApproving(request.id);
        try {
            const identity = await getIdentity();
            if (!identity) throw new Error("Identity not unlocked in memory. Please refresh.");

            // CRITICAL: Alice must use her Ed25519 DEVICE private key to sign,
            // NOT her X25519 identity private key.
            // The server stores userRecord.devicePublicKey = Alice's Ed25519 device public key
            // and verifies: ed25519.verify(sig, msg, aliceDevicePublicKey).
            // If we sign with identity.privateKey (X25519), the signature will NOT verify.
            const deviceIdentity = await getDeviceIdentity();
            if (!deviceIdentity) throw new Error("Device not registered. Please refresh.");

            const targetDeviceKey = request.device_public_key || request.devicePublicKey;

            // 1. Sign Bob's device key hex string with Alice's Ed25519 DEVICE private key.
            //    Server verifies: ed25519.verify(sig, TextEncoder(devicePublicKey), aliceDevicePublicKey)
            //    Bob also verifies client-side using aliceDevicePublicKey included in the payload.
            const { ed25519 } = await import('@noble/curves/ed25519.js');
            const msgBytes = new TextEncoder().encode(targetDeviceKey);
            const aliceDevicePrivBytes = hexToBytes(deviceIdentity.privateKey);
            const sigBytes = ed25519.sign(msgBytes, aliceDevicePrivBytes);
            const identitySignature = bytesToHex(sigBytes);

            // 2. Encrypt Alice's identity for Bob using a binding secret.
            //    bindingSecret = HKDF(alicePublicKey, salt=bobDeviceKey, info='CipherLink-Device-Link-v1')
            //    This is computable by BOTH sides:
            //    - Alice knows her own publicKey and Bob's devicePublicKey (from the link request).
            //    - Bob knows his own deviceKey and Alice's publicKey (= the targetUserKey Bob typed in).
            const bobKeyBytes = hexToBytes(targetDeviceKey);
            const alicePubKeyBytes = hexToBytes(identity.publicKey);
            const bindingSecret = await hkdf(alicePubKeyBytes, bobKeyBytes, 'CipherLink-Device-Link-v1', 32);

            const identityPayload = JSON.stringify({
                publicKey: identity.publicKey,
                privateKey: identity.privateKey,
                recoveryPhrase: identity.recoveryPhrase,
                localUsername: identity.localUsername,
                // Include Alice's Ed25519 device public key so Bob can verify identitySignature locally.
                // This is NOT sensitive — it's already in the public device registry.
                devicePublicKey: deviceIdentity.publicKey,
            });

            const encrypted = await encryptWithSecret(identityPayload, bindingSecret, 'CipherLink-Device-Link-v1');

            await apiRequest('POST', '/api/link/approve', {
                requestId: request.id,
                identitySignature,
                encryptedIdentity: JSON.stringify(encrypted)
            });

            toast({ title: 'Request Approved', description: 'The new device is now linked.' });
            fetchDevices();
        } catch (error) {
            toast({
                title: 'Approval Failed',
                description: error instanceof Error ? error.message : 'Failed to approve request',
                variant: 'destructive',
            });
        } finally {
            setIsApproving(null);
        }
    };

    const handleReject = async (requestId: string) => {
        try {
            await apiRequest('POST', '/api/link/reject', { requestId });
            toast({ title: 'Request Rejected' });
            fetchLinkingRequests();
        } catch (error) {
            toast({ title: 'Failed to Reject', variant: 'destructive' });
        }
    };

    const getDeviceIcon = (name: string = '') => {
        const n = name.toLowerCase();
        if (n.includes('phone') || n.includes('android') || n.includes('ios')) return <Smartphone className="w-5 h-5" />;
        if (n.includes('tablet') || n.includes('ipad')) return <Tablet className="w-5 h-5" />;
        return <Laptop className="w-5 h-5" />;
    };

    return (
        <Dialog onOpenChange={(open) => open && fetchDevices()}>
            <DialogTrigger asChild>
                <Button variant="ghost" className="w-full justify-start">
                    <Smartphone className="w-4 h-4 mr-2" />
                    Devices
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Managed Devices</DialogTitle>
                    <DialogDescription>
                        View and manage devices that have access to your account.
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <ScrollArea className="max-h-[300px] mt-4">
                        <div className="space-y-4 pr-4">
                            {devices.length === 0 ? (
                                <p className="text-center text-muted-foreground py-4">No devices found</p>
                            ) : (
                                devices.map((device) => {
                                    // Handle DB representation mismatch: device_public_key instead of devicePublicKey
                                    const pubKey = device.device_public_key || device.devicePublicKey;
                                    const devName = device.device_name || device.deviceName || 'Unknown Device';
                                    const cDate = device.created_at || device.createdAt;

                                    return (
                                        <div key={pubKey} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                                    {getDeviceIcon(devName)}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium">{devName}</span>
                                                        {pubKey === currentDeviceKey && (
                                                            <Badge variant="secondary" className="text-[10px] h-4">Current</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">
                                                        Registered {cDate ? formatDistanceToNow(new Date(cDate)) : 'recently'} ago
                                                    </p>
                                                </div>
                                            </div>
                                            {pubKey !== currentDeviceKey ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    onClick={() => handleRevoke(pubKey)}
                                                    disabled={isRevoking === pubKey}
                                                >
                                                    {isRevoking === pubKey ? (
                                                        <div className="w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4" />
                                                    )}
                                                </Button>
                                            ) : (
                                                <div className="text-primary pr-2">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                            {linkingRequests.length > 0 && (
                                <>
                                    <div className="flex items-center gap-2 mt-6 mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        <Link className="w-3 h-3" />
                                        Pending Link Requests
                                    </div>
                                    <div className="space-y-3">
                                        {linkingRequests.map((req) => (
                                            <div key={req.id} className="p-3 rounded-lg border border-primary/20 bg-primary/5 animate-pulse-gentle">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <UserPlus className="w-4 h-4 text-primary" />
                                                        <span className="text-sm font-medium">{req.deviceName || 'New Device'}</span>
                                                    </div>
                                                    <Badge variant="outline" className="text-[9px] uppercase">Link Attempt</Badge>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground font-mono mb-3 break-all bg-background/50 p-1.5 rounded">
                                                    {req.devicePublicKey}
                                                </p>
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        className="flex-1 h-8"
                                                        onClick={() => handleApprove(req)}
                                                        disabled={isApproving === req.id}
                                                    >
                                                        {isApproving === req.id ? (
                                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <>
                                                                <Check className="w-3 h-3 mr-1" />
                                                                Approve
                                                            </>
                                                        )}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 text-destructive px-3"
                                                        onClick={() => handleReject(req.id)}
                                                        disabled={isApproving === req.id}
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </ScrollArea>
                )}
            </DialogContent>
        </Dialog>
    );
}
