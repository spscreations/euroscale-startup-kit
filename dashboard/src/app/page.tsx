export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="glass-card max-w-2xl w-full p-10 text-center space-y-6 animate-slide-up">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="gradient-text">EuroScale</span>
          </h1>
          <p className="text-text-secondary text-lg">
            AI-Powered Smart Scale-Up Platform
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm text-text-muted">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
          </span>
          Dashboard is live
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
          {[
            { label: "Databases", icon: "🗄️" },
            { label: "Analytics", icon: "📊" },
            { label: "Settings", icon: "⚙️" },
          ].map((item) => (
            <div
              key={item.label}
              className="shimmer rounded-lg px-4 py-6 text-center text-text-secondary"
            >
              <span className="text-2xl">{item.icon}</span>
              <p className="mt-2 text-sm font-medium">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
