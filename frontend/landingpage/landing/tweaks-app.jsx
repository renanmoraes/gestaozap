/* GestãoZap landing — Tweaks app.
   Mounts only the Tweaks panel (React) over the vanilla page and applies
   each tweak by toggling body classes / a global 3D multiplier. */
const { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle } = window;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "heroTheme": "hibrido",
  "intensidade3d": "imersivo",
  "grade": true,
  "chips": true
}/*EDITMODE-END*/;

const INTENSITY = { imersivo: 1, sutil: 0.5, "sem 3D": 0 };

function TweaksApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    document.body.classList.toggle('hero-light', t.heroTheme === 'claro');
  }, [t.heroTheme]);
  React.useEffect(() => {
    window.LANDING_TW = window.LANDING_TW || {};
    window.LANDING_TW.intensity = INTENSITY[t.intensidade3d] ?? 1;
  }, [t.intensidade3d]);
  React.useEffect(() => {
    document.body.classList.toggle('no-grid', !t.grade);
  }, [t.grade]);
  React.useEffect(() => {
    document.body.classList.toggle('no-chips', !t.chips);
  }, [t.chips]);

  return (
    <TweaksPanel title="Ajustes">
      <TweakSection label="Estilo do hero" />
      <TweakRadio label="Tema" value={t.heroTheme}
        options={['hibrido', 'claro']}
        onChange={(v) => setTweak('heroTheme', v)} />
      <TweakSection label="Efeito 3D" />
      <TweakRadio label="Intensidade" value={t.intensidade3d}
        options={['imersivo', 'sutil', 'sem 3D']}
        onChange={(v) => setTweak('intensidade3d', v)} />
      <TweakSection label="Detalhes do hero" />
      <TweakToggle label="Grade de fundo" value={t.grade}
        onChange={(v) => setTweak('grade', v)} />
      <TweakToggle label="Cards flutuantes" value={t.chips}
        onChange={(v) => setTweak('chips', v)} />
    </TweaksPanel>
  );
}

(function mount() {
  const root = document.createElement('div');
  root.id = 'tweaks-root';
  document.body.appendChild(root);
  ReactDOM.createRoot(root).render(<TweaksApp />);
})();
