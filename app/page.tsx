import { Radio } from 'lucide-react'
import { LiveStudio } from '@/components/live-studio'

export default function Page() {
  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-live text-live-foreground">
              <Radio className="size-5" />
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <span>
                  <span className="text-[#e53238]">e</span>
                  <span className="text-[#0064d2]">B</span>
                  <span className="text-[#f5af02]">a</span>
                  <span className="text-[#86b817]">y</span>
                </span>
                <span className="text-foreground">Live Studio</span>
              </div>
              <p className="text-xs text-muted-foreground">Auto-listing from your live stream</p>
            </div>
          </div>
          <span className="hidden rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground sm:inline">
            Proof of concept
          </span>
        </div>
      </header>
      <LiveStudio />
    </main>
  )
}
