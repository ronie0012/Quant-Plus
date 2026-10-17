import { CapabilitySection } from "./CapabilitySection";
import { STORY } from "@/data/story";

export function SignalEngine() {
  return <CapabilitySection {...STORY.signals} />;
}
