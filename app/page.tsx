export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 32, maxWidth: 880 }}>
      <h1>PermitPilot Truth Engine</h1>
      <p>
        Person A backend is available at <code>POST /api/research/run</code>. Person B can
        build the product UI against the returned <code>ResearchRun</code> artifact.
      </p>
    </main>
  );
}
