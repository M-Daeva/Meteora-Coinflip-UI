import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";
import { RPC_URL } from "./config";
import { ActivityProvider } from "./lib/activity";
import App from "./App";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, retry: 2 } },
});

function Root() {
  // Empty list: wallets are discovered through the Wallet Standard (Phantom, Solflare, Backpack, …)
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <QueryClientProvider client={queryClient}>
            <ActivityProvider>
              <App />
            </ActivityProvider>
          </QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
