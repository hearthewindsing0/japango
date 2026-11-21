import { useState } from 'react'
import {
  Badge,
  Button,
  ChoiceList,
  ControlsHelp,
  DEFAULT_CONTROLS,
  DialogueBox,
  DiscoveryCard,
  DPad,
  Furigana,
  Hotbar,
  JlptBadge,
  Kbd,
  LineBadge,
  LoadingScreen,
  LocationPanel,
  Menu,
  Meter,
  MinimapFrame,
  MinimapPlaceholder,
  NoteBox,
  Panel,
  PanelTitle,
  PlaceCard,
  ScaleControl,
  SignCard,
  Slider,
  SoundToggle,
  StampBook,
  Switch,
  SwitchRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TitleScreen,
  toast,
  Toggle,
  Tooltip,
  Window,
  WordCard,
  type StampSpot,
} from '../ui'
import { story, type Story } from './types'

const STAMPS: StampSpot[] = [
  { id: 'hills', ja: '六本木ヒルズ', en: 'Roppongi Hills', got: true },
  { id: 'midtown', ja: '東京ミッドタウン', en: 'Tokyo Midtown', got: true },
  { id: 'hinokicho', ja: '檜町公園', en: 'Hinokicho Park' },
  { id: 'almond', ja: 'アマンド', en: 'Almond café', got: true },
  { id: 'gonpachi', ja: '権八', en: 'Gonpachi' },
  { id: 'azabudai', ja: '麻布台ヒルズ', en: 'Azabudai Hills' },
]

const CONVO = [
  { s: 0, name: '健太', ja: 'ねえ、今夜[こんや]どこ行[い]く？', en: 'Hey, where are we going tonight?' },
  { s: 1, name: '美咲', ja: 'アマンドの前[まえ]で待[ま]ち合[あ]わせしよう。', en: "Let's meet in front of Almond." },
  { s: 0, name: '健太', ja: 'いいね！じゃあ八時[はちじ]に。', en: 'Sounds good! Eight o’clock, then.' },
]

/** Steps through a conversation so the story is playable. */
function DialogueDemo(p: { mode: string; furigana: boolean; english: boolean; typeSpeed: number; clarity: number }, log: (n: string, ...a: unknown[]) => void) {
  return <DialogueDemoInner {...p} log={log} />
}
function DialogueDemoInner({ mode, furigana, english, typeSpeed, clarity, log }: { mode: string; furigana: boolean; english: boolean; typeSpeed: number; clarity: number; log: (n: string, ...a: unknown[]) => void }) {
  const [i, setI] = useState(0)
  const [en, setEn] = useState(english)
  const l = CONVO[i % CONVO.length]
  return (
    <DialogueBox
      className="w-[36rem] max-w-full"
      mode={mode as 'talk' | 'overhear'}
      speaker={l.name}
      speakerIndex={l.s}
      text={l.ja}
      english={l.en}
      showEnglish={en}
      furigana={furigana}
      typeSpeed={typeSpeed}
      clarity={clarity}
      place="六本木交差点 · 夜の約束"
      onWord={(k) => log('onWord', k)}
      onNext={() => {
        log('onNext')
        setI((n) => n + 1)
      }}
      actions={
        <Toggle pressed={en} onPressedChange={setEn} size="sm" className="h-6 px-2 text-xs">
          EN
        </Toggle>
      }
    />
  )
}

export const STORIES: Story[] = [
  /* ---------------------------------------------------------------- */
  story({
    id: 'button',
    group: 'Basics',
    name: 'Button',
    component: 'Button',
    description: 'Arcade button with cut corners and a pressed-in bottom edge. Variants for main actions (primary), rewards (gold), everyday (secondary) and quiet ones.',
    controls: {
      children: { type: 'text', default: 'はい Yes' },
      variant: { type: 'select', default: 'primary', options: ['primary', 'gold', 'secondary', 'outline', 'ghost'] },
      size: { type: 'select', default: 'md', options: ['sm', 'md', 'lg', 'icon'] },
      disabled: { type: 'boolean', default: false },
    },
    render: (p, log) => (
      <Button variant={p.variant as 'primary'} size={p.size as 'md'} disabled={p.disabled} onClick={() => log('onClick')}>
        {p.children}
      </Button>
    ),
  }),
  story({
    id: 'button-all',
    group: 'Basics',
    name: 'Button · all variants',
    component: 'Button',
    description: 'Every variant and size side by side.',
    controls: { disabled: { type: 'boolean', default: false } },
    render: (p) => (
      <div className="grid gap-3">
        {(['primary', 'gold', 'secondary', 'outline', 'ghost'] as const).map((v) => (
          <div key={v} className="flex flex-wrap items-center gap-2">
            {(['sm', 'md', 'lg'] as const).map((s) => (
              <Button key={s} variant={v} size={s} disabled={p.disabled}>
                {v} {s}
              </Button>
            ))}
            <Button variant={v} size="icon" disabled={p.disabled} aria-label="star">
              ★
            </Button>
          </div>
        ))}
      </div>
    ),
  }),
  story({
    id: 'panel',
    group: 'Basics',
    name: 'Panel',
    component: 'Panel',
    description: 'The basic HUD box. Double pixel frame, chamfered corners, hard shadow, faint scanlines. Every card is built on it.',
    controls: {
      tone: { type: 'select', default: 'ink', options: ['ink', 'paper', 'gold', 'alert', 'glass'] },
      size: { type: 'select', default: 'md', options: ['sm', 'md', 'lg'] },
      title: { type: 'text', default: 'Status' },
      children: { type: 'text', default: 'A box for anything drawn over the game.', multiline: true },
      shadow: { type: 'boolean', default: true },
    },
    render: (p) => (
      <Panel tone={p.tone as 'ink'} size={p.size as 'md'} shadow={p.shadow} className="w-80">
        {p.title && <PanelTitle>{p.title}</PanelTitle>}
        {p.children}
      </Panel>
    ),
  }),
  story({
    id: 'badges',
    group: 'Basics',
    name: 'Badge · Kbd · Line',
    component: 'Badge',
    description: 'Small labels: shop open/closed signs, gold and red tags, train line bullets, JLPT levels and keyboard keys.',
    controls: {
      text: { type: 'text', default: '営業中' },
      variant: { type: 'select', default: 'open', options: ['open', 'closed', 'gold', 'shu', 'outline', 'neon'] },
    },
    render: (p) => (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2 text-lg">
          <Badge variant={p.variant as 'open'}>{p.text}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="open">営業中</Badge>
          <Badge variant="closed">準備中</Badge>
          <Badge variant="gold">居酒屋</Badge>
          <Badge variant="shu">NEW</Badge>
          <Badge variant="neon">BAR</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xl">
          <LineBadge letter="H" color="#9ca3a9" />
          <LineBadge letter="E" color="#b6007a" />
          <LineBadge letter="G" color="#f39700" />
          {([5, 4, 3, 2, 1] as const).map((l) => (
            <JlptBadge key={l} level={l} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xl">
          <Kbd>W</Kbd>
          <Kbd>A</Kbd>
          <Kbd>S</Kbd>
          <Kbd>D</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>Esc</Kbd>
        </div>
      </div>
    ),
  }),

  /* ---------------------------------------------------------------- */
  story({
    id: 'toggle',
    group: 'Controls',
    name: 'Toggle',
    component: 'Toggle',
    description: 'Push-on / push-off button for furigana, English, sound.',
    controls: {
      children: { type: 'text', default: 'ふりがな' },
      size: { type: 'select', default: 'md', options: ['sm', 'md', 'icon'] },
      disabled: { type: 'boolean', default: false },
    },
    render: (p, log) => (
      <Toggle size={p.size as 'md'} disabled={p.disabled} defaultPressed onPressedChange={(v) => log('onPressedChange', v)}>
        {p.children}
      </Toggle>
    ),
  }),
  story({
    id: 'switch',
    group: 'Controls',
    name: 'Switch',
    component: 'SwitchRow',
    description: 'ON/OFF hardware-style switch, alone or with a label for settings lists.',
    controls: {
      label: { type: 'text', default: 'Furigana' },
      hint: { type: 'text', default: 'Readings over kanji (F)' },
      disabled: { type: 'boolean', default: false },
    },
    render: (p, log) => (
      <Panel className="w-80">
        <SwitchRow label={p.label} hint={p.hint} disabled={p.disabled} defaultChecked onCheckedChange={(v) => log('onCheckedChange', v)} />
        <SwitchRow label="English subtitles" hint="Under overheard talk (T)" />
        <div className="mt-3 flex gap-3">
          <Switch defaultChecked />
          <Switch />
        </div>
      </Panel>
    ),
  }),
  story({
    id: 'slider',
    group: 'Controls',
    name: 'Slider',
    component: 'Slider',
    description: 'Chunky stepped slider for volume and text speed.',
    controls: {
      max: { type: 'number', default: 100, min: 10, max: 200 },
      step: { type: 'number', default: 10, min: 1, max: 50 },
    },
    render: (p, log) => (
      <Panel className="w-80">
        <PanelTitle>Volume</PanelTitle>
        <Slider defaultValue={[60]} max={p.max} step={p.step} onValueChange={(v) => log('onValueChange', v[0])} />
      </Panel>
    ),
  }),
  story({
    id: 'meter',
    group: 'Controls',
    name: 'Meter',
    component: 'Meter',
    description: 'Segmented RPG-style bar: loading, quest progress, streaks.',
    controls: {
      value: { type: 'number', default: 60, min: 0, max: 100 },
      segments: { type: 'number', default: 10, min: 3, max: 30 },
      color: { type: 'color', default: '#7cc25c' },
      label: { type: 'text', default: 'HP' },
    },
    render: (p) => (
      <Panel className="w-80">
        <Meter value={p.value} segments={p.segments} color={p.color} label={p.label} />
      </Panel>
    ),
  }),
  story({
    id: 'tabs',
    group: 'Controls',
    name: 'Tabs',
    component: 'Tabs',
    description: 'Index-card tabs for pages inside a window (phrasebook, settings).',
    controls: {},
    render: () => (
      <Panel className="w-96">
        <Tabs defaultValue="words">
          <TabsList>
            <TabsTrigger value="words">単語 Words</TabsTrigger>
            <TabsTrigger value="phrases">フレーズ</TabsTrigger>
            <TabsTrigger value="kanji">漢字</TabsTrigger>
          </TabsList>
          <TabsContent value="words">
            <Furigana text="乾杯[かんぱい] · 生[なま]ビール · お会計[かいけい]" />
          </TabsContent>
          <TabsContent value="phrases">
            <Furigana text="すみません、注文[ちゅうもん]いいですか？" />
          </TabsContent>
          <TabsContent value="kanji">六 本 木 坂 駅</TabsContent>
        </Tabs>
      </Panel>
    ),
  }),
  story({
    id: 'tooltip',
    group: 'Controls',
    name: 'Tooltip',
    component: 'Tooltip',
    description: 'Hover / focus hint in a paper chip.',
    controls: {
      content: { type: 'text', default: 'Stamp book (B)' },
      side: { type: 'select', default: 'top', options: ['top', 'bottom', 'left', 'right'] },
    },
    render: (p) => (
      <Tooltip content={p.content} side={p.side as 'top'}>
        <Button>🎴 Hover me</Button>
      </Tooltip>
    ),
  }),
  story({
    id: 'menu',
    group: 'Controls',
    name: 'Menu (drop-down)',
    component: 'Menu',
    description: 'Drop-down menu from a button, with the blinking ▶ cursor and key hints.',
    controls: { label: { type: 'text', default: 'OPTIONS' } },
    render: (p, log) => (
      <Menu
        label={p.label}
        trigger={<Button>⚙ Menu</Button>}
        items={[
          { label: 'Map', shortcut: 'M', onSelect: () => log('Map') },
          { label: 'Stamp book', shortcut: 'B', onSelect: () => log('Stamp book') },
          { label: 'Phrasebook', hint: 'Coming soon', disabled: true },
          { label: 'Quit to title', danger: true, onSelect: () => log('Quit') },
        ]}
      />
    ),
  }),
  story({
    id: 'choices',
    group: 'Controls',
    name: 'ChoiceList',
    component: 'ChoiceList',
    description: 'Always-open RPG command list for replies in a conversation and pause menus. Arrow keys / W S to move, Enter to pick, 1–9 to jump.',
    controls: { numbered: { type: 'boolean', default: true } },
    render: (p, log) => (
      <Panel className="w-96">
        <PanelTitle>Reply 返事</PanelTitle>
        <ChoiceList
          numbered={p.numbered}
          autoFocus
          onChoose={(i) => log('onChoose', i)}
          items={[
            { label: <Furigana text="はい、行[い]きます！" />, hint: "Yes, I'll go!" },
            { label: <Furigana text="ちょっと考[かんが]えます。" />, hint: 'Let me think about it.' },
            { label: <Furigana text="すみません、分[わ]かりません。" />, hint: "Sorry, I don't understand." },
            { label: '…(stay quiet)', disabled: true },
          ]}
        />
      </Panel>
    ),
  }),
  story({
    id: 'window',
    group: 'Controls',
    name: 'Window (modal)',
    component: 'Window',
    description: 'Modal window with a red title bar. Esc or ✕ closes it. Ink or paper.',
    controls: {
      title: { type: 'text', default: '設定' },
      subtitle: { type: 'text', default: 'Settings' },
      tone: { type: 'select', default: 'ink', options: ['ink', 'paper'] },
      width: { type: 'number', default: 460, min: 280, max: 900, step: 20 },
    },
    render: (p, log) => (
      <Window
        title={p.title}
        subtitle={p.subtitle}
        tone={p.tone as 'ink'}
        width={p.width}
        onOpenChange={(o) => log('onOpenChange', o)}
        trigger={<Button variant="primary">Open window</Button>}
        footer={
          <>
            <Button size="sm">Cancel</Button>
            <Button size="sm" variant="gold">
              OK
            </Button>
          </>
        }
      >
        <SwitchRow label="Furigana" hint="F" defaultChecked />
        <SwitchRow label="English subtitles" hint="T" />
        <div className="mt-3">
          <div className="mb-1 text-sm">Text speed</div>
          <Slider defaultValue={[30]} max={60} step={5} />
        </div>
      </Window>
    ),
  }),
  story({
    id: 'toast',
    group: 'Controls',
    name: 'Toast',
    component: 'toast',
    description: 'Pop-up notices. Call toast({...}) from anywhere (even the game loop); a <Toaster/> inside UiRoot shows them.',
    controls: {
      kind: { type: 'select', default: 'stamp', options: ['stamp', 'discovery', 'info', 'warn'] },
      title: { type: 'text', default: 'スタンプ GET!' },
      body: { type: 'text', default: '六本木ヒルズ · 3/6' },
    },
    render: (p) => (
      <Button variant="gold" onClick={() => toast({ kind: p.kind as 'stamp', title: p.title, body: p.body })}>
        Fire toast
      </Button>
    ),
  }),

  /* ---------------------------------------------------------------- */
  story({
    id: 'furigana',
    group: 'Language',
    name: 'Furigana',
    component: 'Furigana',
    description: 'Japanese text with readings over the kanji. Write "word[reading]" (or pass dictionary segments); words with readings become tappable for a word card.',
    controls: {
      text: { type: 'text', default: '六本木[ろっぽんぎ]の交差点[こうさてん]で友達[ともだち]を待[ま]っています。', multiline: true },
      furigana: { type: 'boolean', default: true },
      tappable: { type: 'boolean', default: true },
    },
    render: (p, log) => (
      <Panel className="w-[30rem] max-w-full text-2xl leading-[2]">
        <Furigana text={p.text} furigana={p.furigana} onWord={p.tappable ? (k) => log('onWord', k) : undefined} />
      </Panel>
    ),
  }),
  story({
    id: 'wordcard',
    group: 'Language',
    name: 'WordCard',
    component: 'WordCard',
    description: 'The card for a tapped word: reading, meanings, JLPT level, each kanji with readings, and an example sentence.',
    controls: {
      word: { type: 'text', default: '交差点' },
      reading: { type: 'text', default: 'こうさてん' },
      romaji: { type: 'text', default: 'kōsaten' },
      pos: { type: 'text', default: 'noun' },
      meanings: { type: 'text', default: 'crossing; intersection', multiline: true },
      jlpt: { type: 'select', default: '3', options: ['', '5', '4', '3', '2', '1'] },
      furigana: { type: 'boolean', default: true },
    },
    render: (p, log) => (
      <WordCard
        word={p.word}
        reading={p.reading}
        romaji={p.romaji}
        pos={p.pos}
        meanings={p.meanings.split(/;\s*|\n/).filter(Boolean)}
        jlpt={p.jlpt ? (Number(p.jlpt) as 3) : undefined}
        furigana={p.furigana}
        kanji={[
          { char: '交', meanings: ['mix', 'cross'], on: ['コウ'], kun: ['まじ.わる'], strokes: 6 },
          { char: '差', meanings: ['difference', 'point'], on: ['サ'], kun: ['さ.す'], strokes: 10 },
          { char: '点', meanings: ['spot', 'point'], on: ['テン'], strokes: 9 },
        ]}
        example="次[つぎ]の交差点[こうさてん]を右[みぎ]に曲[ま]がってください。"
        exampleEn="Please turn right at the next intersection."
        onWord={(k) => log('onWord', k)}
        onClose={() => log('onClose')}
      />
    ),
  }),
  story({
    id: 'dialogue',
    group: 'Language',
    name: 'DialogueBox',
    component: 'DialogueBox',
    description: 'Subtitles and dialogue: speaker nameplate, typewriter reveal, furigana, EN line, ▼ for next. "overhear" is the eavesdropping look and fades with clarity. Click to skip / advance.',
    controls: {
      mode: { type: 'select', default: 'talk', options: ['talk', 'overhear'] },
      furigana: { type: 'boolean', default: true },
      english: { type: 'boolean', default: true },
      typeSpeed: { type: 'number', default: 24, min: 0, max: 80 },
      clarity: { type: 'number', default: 1, min: 0, max: 1, step: 0.05 },
    },
    render: (p, log) => DialogueDemo(p, log),
  }),
  story({
    id: 'note',
    group: 'Language',
    name: 'NoteBox',
    component: 'NoteBox',
    description: 'Short language or culture tip, shown after a conversation ends.',
    controls: {
      text: { type: 'text', default: '待[ま]ち合[あ]わせ means meeting up at an agreed spot. アマンド in Roppongi is the classic one.', multiline: true },
      english: { type: 'text', default: '' },
    },
    render: (p) => (
      <NoteBox className="w-[30rem] max-w-full" english={p.english || undefined}>
        <Furigana text={p.text} />
      </NoteBox>
    ),
  }),

  /* ---------------------------------------------------------------- */
  story({
    id: 'location',
    group: 'HUD',
    name: 'LocationPanel',
    component: 'LocationPanel',
    description: 'Top-left box: where you are, Tokyo time and weather, street and station.',
    controls: {
      area: { type: 'text', default: '六本木[ろっぽんぎ]' },
      areaEn: { type: 'text', default: 'Roppongi' },
      time: { type: 'text', default: '21:47' },
      weather: { type: 'select', default: 'rain', options: ['clear', 'cloudy', 'rain', 'snow', 'night'] },
      temp: { type: 'number', default: 14, min: -5, max: 38 },
      street: { type: 'text', default: '外苑東通[がいえんひがしどお]り' },
      streetEn: { type: 'text', default: 'Gaien-Higashi-dori' },
      station: { type: 'boolean', default: true },
      furigana: { type: 'boolean', default: true },
    },
    render: (p) => (
      <LocationPanel
        {...p}
        weather={p.weather as 'rain'}
        station={p.station ? { name: '六本木駅[ろっぽんぎえき]', nameEn: 'Roppongi', line: 'Hibiya Line', letter: 'H', color: '#9ca3a9' } : undefined}
      />
    ),
  }),
  story({
    id: 'minimap',
    group: 'HUD',
    name: 'MinimapFrame',
    component: 'MinimapFrame',
    description: 'Frame for the minimap canvas: N compass that turns with the camera, label, coordinates, big/small toggle. The game puts its real canvas inside.',
    controls: {
      size: { type: 'number', default: 180, min: 120, max: 260, step: 10 },
      big: { type: 'boolean', default: false },
      heading: { type: 'number', default: 30, min: 0, max: 359 },
      label: { type: 'text', default: '六本木 6丁目' },
      coords: { type: 'text', default: '35.663N' },
    },
    render: (p, log) => (
      <MinimapFrame {...p} onToggleBig={() => log('onToggleBig')}>
        <MinimapPlaceholder />
      </MinimapFrame>
    ),
  }),
  story({
    id: 'place',
    group: 'HUD',
    name: 'PlaceCard',
    component: 'PlaceCard',
    description: 'The shop / bar you are standing next to: open or closed, type of place, today’s hours.',
    controls: {
      name: { type: 'text', default: '権八[ごんぱち]' },
      nameEn: { type: 'text', default: 'Gonpachi Nishi-Azabu' },
      status: { type: 'select', default: 'open', options: ['open', 'closed', 'gone'] },
      cuisine: { type: 'text', default: '居酒屋' },
      cuisineEn: { type: 'text', default: 'izakaya' },
      hours: { type: 'text', default: '11:30–3:30' },
      furigana: { type: 'boolean', default: true },
    },
    render: (p) => <PlaceCard {...p} status={p.status as 'open'} />,
  }),
  story({
    id: 'sign',
    group: 'HUD',
    name: 'SignCard',
    component: 'SignCard',
    description: 'Street and station signs: green slope 坂 posts, white station boards, red shop doors, with a note underneath.',
    controls: {
      kind: { type: 'select', default: 'slope', options: ['slope', 'station', 'door'] },
      title: { type: 'text', default: '芋洗坂[いもあらいざか]' },
      kana: { type: 'text', default: '' },
      english: { type: 'text', default: 'Imoarai-zaka: “potato-washing slope”' },
      note: { type: 'text', default: '坂 (さか) means slope. It drops about 12 m from here.' },
      furigana: { type: 'boolean', default: true },
    },
    render: (p) => <SignCard {...p} kind={p.kind as 'slope'} kana={p.kana || undefined} />,
  }),
  story({
    id: 'discovery',
    group: 'HUD',
    name: 'DiscoveryCard',
    component: 'DiscoveryCard',
    description: 'A place worth knowing about, with a short Japanese / English blurb and links. Stamp spots get a 🎴 tag.',
    controls: {
      name: { type: 'text', default: '六本木[ろっぽんぎ]ヒルズ' },
      nameEn: { type: 'text', default: 'Roppongi Hills' },
      stamp: { type: 'boolean', default: true },
      textJa: { type: 'text', default: '2003年[ねん]に開業[かいぎょう]した複合施設[ふくごうしせつ]。', multiline: true },
      textEn: { type: 'text', default: 'A mixed-use complex that opened in 2003.', multiline: true },
      furigana: { type: 'boolean', default: true },
    },
    render: (p) => (
      <DiscoveryCard
        {...p}
        links={[
          { label: '日本語', href: 'https://ja.wikipedia.org/wiki/六本木ヒルズ' },
          { label: 'English', href: 'https://en.wikipedia.org/wiki/Roppongi_Hills' },
        ]}
      />
    ),
  }),
  story({
    id: 'stampbook',
    group: 'HUD',
    name: 'StampBook',
    component: 'StampBook',
    description: 'The stamp rally, shown in a paper Window. Collected stamps are red hanko seals.',
    controls: {
      collected: { type: 'number', default: 3, min: 0, max: 6 },
      inWindow: { type: 'boolean', default: false },
    },
    render: (p) => {
      const spots = STAMPS.map((s, i) => ({ ...s, got: i < p.collected }))
      const book = <StampBook spots={spots} found={11} total={42} />
      return p.inWindow ? (
        <Window title="スタンプラリー" subtitle="Stamp rally" tone="paper" width={560} defaultOpen trigger={<Button variant="gold">🎴 Open stamp book</Button>}>
          {book}
        </Window>
      ) : (
        <Panel tone="paper" className="w-[34rem] max-w-full">
          {book}
        </Panel>
      )
    },
  }),
  story({
    id: 'controls-help',
    group: 'HUD',
    name: 'ControlsHelp',
    component: 'ControlsHelp',
    description: 'The keys and what they do. Short keys become key caps.',
    controls: {},
    render: () => (
      <Panel className="w-96">
        <PanelTitle>Controls</PanelTitle>
        <ControlsHelp controls={DEFAULT_CONTROLS} />
      </Panel>
    ),
  }),
  story({
    id: 'scale',
    group: 'HUD',
    name: 'ScaleControl (A− / A+)',
    component: 'ScaleControl',
    description: 'The A−/A+ stepper. It drives the nearest UiRoot, so in here it changes the whole stage, same as the scale in the top bar.',
    controls: {},
    render: () => (
      <Panel>
        <ScaleControl />
      </Panel>
    ),
  }),
  story({
    id: 'sound',
    group: 'HUD',
    name: 'SoundToggle',
    component: 'SoundToggle',
    description: 'Sound on / off button.',
    controls: {},
    render: (_, log) => <SoundDemo log={log} />,
  }),
  story({
    id: 'dpad',
    group: 'HUD',
    name: 'DPad',
    component: 'DPad',
    description: 'Touch D-pad with turn buttons. Presentational: wire onPress / onRelease to the game input.',
    controls: {
      size: { type: 'number', default: 150, min: 100, max: 240, step: 10 },
      turn: { type: 'boolean', default: true },
    },
    render: (p, log) => (
      <DPad size={p.size} onPress={(d) => log('onPress', d)} onRelease={(d) => log('onRelease', d)} onTurn={p.turn ? (d) => log('onTurn', d) : undefined} />
    ),
  }),
  story({
    id: 'hotbar',
    group: 'HUD',
    name: 'Hotbar',
    component: 'Hotbar',
    description: 'The bottom bar of actions. Pressed slots light up gold; badges count new things.',
    controls: {
      stamps: { type: 'number', default: 3, min: 0, max: 99 },
      activeMap: { type: 'boolean', default: false },
    },
    render: (p, log) => (
      <Hotbar
        slots={[
          { id: 'map', icon: '🗺', label: 'Map', shortcut: 'M', active: p.activeMap, onClick: () => log('map') },
          { id: 'stamps', icon: '🎴', label: 'Stamps', shortcut: 'B', badge: p.stamps || undefined, onClick: () => log('stamps') },
          { id: 'phrase', icon: '📖', label: 'Phrases', shortcut: 'P', onClick: () => log('phrases') },
          { id: 'talk', icon: '💬', label: 'Talk', shortcut: 'E', onClick: () => log('talk') },
          { id: 'settings', icon: '⚙', label: 'Settings', shortcut: 'Esc', onClick: () => log('settings') },
        ]}
      />
    ),
  }),

  /* ---------------------------------------------------------------- */
  story({
    id: 'loading',
    group: 'Screens',
    name: 'LoadingScreen',
    component: 'LoadingScreen',
    description: 'Full-screen loading with a segmented bar and a tip.',
    layout: 'fill',
    controls: {
      progress: { type: 'number', default: 64, min: 0, max: 100 },
      label: { type: 'text', default: 'Loading map' },
      tip: { type: 'text', default: 'Press F to show or hide furigana.' },
    },
    render: (p) => <LoadingScreen {...p} />,
  }),
  story({
    id: 'title',
    group: 'Screens',
    name: 'TitleScreen',
    component: 'TitleScreen',
    description: 'Title screen with an 80s sunset, a big logo, and either PRESS START or a menu.',
    layout: 'fill',
    controls: {
      title: { type: 'text', default: 'JAPANGO' },
      subtitle: { type: 'text', default: '六本木 · Roppongi' },
      menu: { type: 'boolean', default: true },
    },
    render: (p, log) => (
      <TitleScreen title={p.title} subtitle={p.subtitle}>
        {p.menu && (
          <Panel>
            <ChoiceList
              autoFocus
              onChoose={(i) => log('onChoose', i)}
              items={[{ label: 'はじめる Start' }, { label: 'つづき Continue' }, { label: '設定 Settings' }]}
            />
          </Panel>
        )}
      </TitleScreen>
    ),
  }),
  story({
    id: 'hud',
    group: 'Screens',
    name: 'Full HUD',
    component: 'UiRoot',
    description: 'Everything together over the game, laid out like the real HUD. Use A−/A+ in the top bar to see it all scale.',
    layout: 'fill',
    controls: {
      overhear: { type: 'boolean', default: true },
      place: { type: 'boolean', default: true },
    },
    render: (p, log) => (
      <div className="relative size-full overflow-hidden">
        <div className="absolute top-3 left-3">
          <LocationPanel area="六本木[ろっぽんぎ]" areaEn="Roppongi" time="21:47" weather="rain" temp={14} street="外苑東通[がいえんひがしどお]り" streetEn="Gaien-Higashi-dori" />
        </div>
        <div className="absolute top-3 right-3">
          <MinimapFrame size={150} heading={30} label="六本木 6丁目">
            <MinimapPlaceholder />
          </MinimapFrame>
        </div>
        <div className="absolute bottom-28 left-1/2 flex w-[min(36rem,calc(100%-24px))] -translate-x-1/2 flex-col gap-3">
          {p.place && <PlaceCard name="アマンド" nameEn="Almond café" status="open" cuisine="喫茶店" cuisineEn="café" hours="7:00–23:00" />}
          {p.overhear && DialogueDemo({ mode: 'overhear', furigana: true, english: true, typeSpeed: 24, clarity: 0.9 }, log)}
        </div>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <Hotbar
            slots={[
              { id: 'map', icon: '🗺', label: 'Map', shortcut: 'M' },
              { id: 'stamps', icon: '🎴', label: 'Stamps', shortcut: 'B', badge: 3 },
              { id: 'phrase', icon: '📖', label: 'Phrases', shortcut: 'P' },
              { id: 'settings', icon: '⚙', label: 'Settings', shortcut: 'Esc' },
            ]}
          />
        </div>
        <div className="absolute right-3 bottom-3 hidden sm:block">
          <DPad size={120} />
        </div>
      </div>
    ),
  }),
]

function SoundDemo({ log }: { log: (n: string, ...a: unknown[]) => void }) {
  const [muted, setMuted] = useState(false)
  return (
    <SoundToggle
      muted={muted}
      onMutedChange={(m) => {
        setMuted(m)
        log('onMutedChange', m)
      }}
    />
  )
}
