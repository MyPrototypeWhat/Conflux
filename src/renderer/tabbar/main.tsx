import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@/index.css"
import { TabBar } from "./App"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TabBar />
  </StrictMode>
)
