import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, KeyRound, SmartphoneNfc } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function IdentityDialog({ publicKey }: { publicKey: string }) {
  const { toast } = useToast();

  const copyKey = () => {
    navigator.clipboard.writeText(publicKey);
    toast({ title: "Public Key copied" });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full justify-start h-9 px-2 text-sm">
          <KeyRound className="w-4 h-4 mr-2" />
          My Identity
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-center font-bold">Your Public Identity</DialogTitle>
          <DialogDescription className="text-center text-xs">
            Share this public key with your other devices to link them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ml-1">
              Public Key
            </label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={publicKey}
                className="font-mono text-[10px] bg-muted/30 h-9"
              />
              <Button size="icon" variant="outline" onClick={copyKey} className="h-9 w-9 shrink-0">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-dashed bg-accent/5 flex flex-col items-center gap-3">
             <SmartphoneNfc className="w-8 h-8 text-muted-foreground/30" />
             <div className="text-center">
               <p className="text-sm font-medium">Link New Device</p>
               <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                 Open CipherLink on your new device and select 
                 <span className="text-foreground font-semibold"> "Link Existing Device"</span>.
               </p>
             </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
