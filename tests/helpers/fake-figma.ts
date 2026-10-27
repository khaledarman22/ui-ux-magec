/**
 * MOCK — an in-memory imitation of the subset of the Figma Plugin API used by apps/figma-plugin/src/executor.ts.
 * It lets the real plugin executor run in tests. Passing tests against this fake do NOT prove that the live
 * Figma integration works; see tests/e2e/figma-live.test.ts for the live check.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

let seq = 1;
const nextId = () => `${Math.floor(seq / 1000) + 1}:${seq++ % 1000}`;

const CONTAINER_TYPES = new Set(['DOCUMENT', 'PAGE', 'FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);
const SHAPE_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'RECTANGLE', 'ELLIPSE', 'TEXT', 'LINE']);

export class FakeNode {
  id = nextId();
  name = '';
  parent: FakeNode | null = null;
  removed = false;
  pluginData = new Map<string, string>();
  [key: string]: any;

  constructor(public readonly type: string, readonly api: FakeFigma) {
    if (CONTAINER_TYPES.has(type)) this.children = [] as FakeNode[];
    if (SHAPE_TYPES.has(type)) {
      Object.assign(this, { x: 0, y: 0, width: 100, height: 100, visible: true, opacity: 1, fills: [], strokes: [], effects: [], strokeWeight: 1, constraints: { horizontal: 'MIN', vertical: 'MIN' }, layoutPositioning: 'AUTO', absoluteBoundingBox: null });
      if (type !== 'TEXT' && type !== 'LINE') this.cornerRadius = 0;
    }
    if (['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE'].includes(type)) {
      Object.assign(this, { layoutMode: 'NONE', itemSpacing: 0, counterAxisSpacing: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, primaryAxisAlignItems: 'MIN', counterAxisAlignItems: 'MIN', layoutWrap: 'NO_WRAP', clipsContent: true, primaryAxisSizingMode: 'FIXED', counterAxisSizingMode: 'FIXED' });
    }
    if (SHAPE_TYPES.has(type)) {
      let h = 'FIXED';
      let v = 'FIXED';
      Object.defineProperty(this, 'layoutSizingHorizontal', { enumerable: true, get: () => h, set: (val: string) => (h = this.checkSizing(val)) });
      Object.defineProperty(this, 'layoutSizingVertical', { enumerable: true, get: () => v, set: (val: string) => (v = this.checkSizing(val)) });
    }
    if (type === 'TEXT') {
      Object.assign(this, { characters: '', fontSize: 12, fontName: { family: 'Inter', style: 'Regular' }, textAlignHorizontal: 'LEFT', textAutoResize: 'WIDTH_AND_HEIGHT', hasMissingFont: false, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PIXELS', value: 0 }, textCase: 'ORIGINAL', textStyleId: '' });
    }
  }

  private checkSizing(val: string): string {
    if (val === 'FILL' && (!this.parent || !this.parent.layoutMode || this.parent.layoutMode === 'NONE')) throw new Error('FILL can only be set on children of auto-layout frames');
    if (val === 'HUG' && this.type !== 'TEXT' && (!this.layoutMode || this.layoutMode === 'NONE')) throw new Error('HUG can only be set on auto-layout frames and text');
    return val;
  }

  getPluginData(k: string): string {
    return this.pluginData.get(k) ?? '';
  }
  setPluginData(k: string, v: string): void {
    this.pluginData.set(k, v);
  }
  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }
  remove(): void {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
    const mark = (n: FakeNode) => {
      n.removed = true;
      this.api.nodes.delete(n.id);
      (n.children ?? []).forEach(mark);
    };
    mark(this);
  }
  appendChild(n: FakeNode): void {
    this.insertChild(this.children.length, n);
  }
  insertChild(i: number, n: FakeNode): void {
    if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1);
    this.children.splice(Math.min(i, this.children.length), 0, n);
    n.parent = this;
  }
  findAll(pred: (n: FakeNode) => boolean = () => true): FakeNode[] {
    const out: FakeNode[] = [];
    const walk = (n: FakeNode) => {
      for (const c of n.children ?? []) {
        if (pred(c)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  findOne(pred: (n: FakeNode) => boolean): FakeNode | null {
    return this.findAll(pred)[0] ?? null;
  }
  findAllWithCriteria(c: { types: string[] }): FakeNode[] {
    return this.findAll((n) => c.types.includes(n.type));
  }
  async loadAsync(): Promise<void> {}
  async exportAsync(): Promise<Uint8Array> {
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  }
  async setTextStyleIdAsync(id: string): Promise<void> {
    this.textStyleId = id;
  }
  createInstance(): FakeNode {
    const inst = this.api.track(new FakeNode('INSTANCE', this.api));
    inst.mainComponent = this;
    inst.width = this.width;
    inst.height = this.height;
    for (const c of this.children) inst.appendChild(this.api.cloneForInstance(c));
    this.api.currentPage.appendChild(inst);
    return inst;
  }
  get defaultVariant(): FakeNode | undefined {
    return this.type === 'COMPONENT_SET' ? this.children[0] : undefined;
  }
  get key(): string {
    return `key-${this.id}`;
  }
  description = '';
}

export interface FakeFigmaOptions {
  fileName?: string;
  fileKey?: string;
  fonts?: Array<{ family: string; style: string }>;
  /** Fail the next N calls of an API method, to simulate Figma errors. */
}

export class FakeFigma {
  nodes = new Map<string, FakeNode>();
  root: FakeNode;
  currentPage: FakeNode;
  editorType = 'figma';
  apiVersion = '1.0.0';
  fileKey: string | undefined;
  fonts: Array<{ family: string; style: string }>;
  textStyles: any[] = [];
  paintStyles: any[] = [];
  collections: any[] = [];
  variablesList: any[] = [];
  /** Methods that should throw on their next call (fault injection). */
  failNext = new Map<string, Error>();
  calls: string[] = [];

  constructor(opts: FakeFigmaOptions = {}) {
    this.fileKey = opts.fileKey;
    this.fonts = opts.fonts ?? [{ family: 'Inter', style: 'Regular' }, { family: 'Inter', style: 'Medium' }, { family: 'Inter', style: 'Semi Bold' }, { family: 'Inter', style: 'Bold' }, { family: 'Cairo', style: 'Regular' }, { family: 'Cairo', style: 'Bold' }];
    this.root = this.track(new FakeNode('DOCUMENT', this));
    this.root.name = opts.fileName ?? 'Test file';
    this.currentPage = this.createPage();
    this.currentPage.name = 'Page 1';
  }

  track(n: FakeNode): FakeNode {
    this.nodes.set(n.id, n);
    return n;
  }

  private maybeFail(method: string): void {
    this.calls.push(method);
    const err = this.failNext.get(method);
    if (err) {
      this.failNext.delete(method);
      throw err;
    }
  }

  cloneForInstance(n: FakeNode): FakeNode {
    const c = this.track(new FakeNode(n.type, this));
    for (const k of ['name', 'characters', 'fontSize', 'fontName', 'width', 'height']) if (k in n) c[k] = n[k];
    for (const child of n.children ?? []) c.appendChild(this.cloneForInstance(child));
    return c;
  }

  private create(type: string): FakeNode {
    this.maybeFail(`create${type}`);
    const n = this.track(new FakeNode(type, this));
    this.currentPage.appendChild(n);
    return n;
  }
  createFrame = () => this.create('FRAME');
  createComponent = () => this.create('COMPONENT');
  createText = () => this.create('TEXT');
  createRectangle = () => this.create('RECTANGLE');
  createEllipse = () => this.create('ELLIPSE');
  createLine = () => this.create('LINE');
  createNodeFromSvg = (_svg: string) => this.create('FRAME');
  createPage = (): FakeNode => {
    const p = this.track(new FakeNode('PAGE', this));
    p.name = 'Page';
    this.root?.appendChild(p);
    return p;
  };
  async getNodeByIdAsync(id: string): Promise<FakeNode | null> {
    const n = this.nodes.get(id);
    return n && !n.removed ? n : null;
  }
  async loadFontAsync(f: { family: string; style: string }): Promise<void> {
    if (!this.fonts.some((x) => x.family === f.family && x.style === f.style)) throw new Error(`font ${f.family} ${f.style} not available`);
  }
  async listAvailableFontsAsync() {
    return this.fonts.map((fontName) => ({ fontName }));
  }
  async loadAllPagesAsync(): Promise<void> {}
  async getLocalTextStylesAsync() {
    return this.textStyles;
  }
  async getLocalPaintStylesAsync() {
    return this.paintStyles;
  }
  async getLocalEffectStylesAsync() {
    return [];
  }
  createTextStyle = () => {
    const s = { id: `S:${nextId()}`, name: '', fontName: null, fontSize: 12, lineHeight: { unit: 'AUTO' }, letterSpacing: null };
    this.textStyles.push(s);
    return s;
  };
  createPaintStyle = () => {
    const s = { id: `S:${nextId()}`, name: '', paints: [] };
    this.paintStyles.push(s);
    return s;
  };
  combineAsVariants = (comps: FakeNode[], parent: FakeNode): FakeNode => {
    const set = this.track(new FakeNode('COMPONENT_SET', this));
    parent.appendChild(set);
    for (const c of comps) set.appendChild(c);
    return set;
  };
  createImage = (bytes: Uint8Array) => ({ hash: `img-${bytes.byteLength}`, getSizeAsync: async () => ({ width: 10, height: 10 }) });
  base64Decode = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));
  base64Encode = (b: Uint8Array) => Buffer.from(b).toString('base64');

  variables = {
    getLocalVariableCollectionsAsync: async () => this.collections,
    getLocalVariablesAsync: async () => this.variablesList.filter((v) => !v.removed),
    createVariableCollection: (name: string) => {
      const c: any = { id: `VC:${nextId()}`, name, modes: [{ modeId: `m${nextId()}`, name: 'Mode 1' }] };
      c.renameMode = (id: string, n: string) => (c.modes.find((m: any) => m.modeId === id).name = n);
      c.addMode = (n: string) => {
        const modeId = `m${nextId()}`;
        c.modes.push({ modeId, name: n });
        return modeId;
      };
      this.collections.push(c);
      return c;
    },
    createVariable: (name: string, collection: any, type: string) => {
      const v: any = { id: `V:${nextId()}`, name, resolvedType: type, variableCollectionId: collection.id, valuesByMode: {}, removed: false };
      v.setValueForMode = (m: string, val: unknown) => (v.valuesByMode[m] = val);
      v.remove = () => (v.removed = true);
      this.variablesList.push(v);
      return v;
    },
    setBoundVariableForPaint: (paint: any, _field: string, v: any) => ({ ...paint, boundVariables: { color: { type: 'VARIABLE_ALIAS', id: v.id } } }),
  };

  /* ---------- test helpers ---------- */

  page(name: string): FakeNode | undefined {
    return this.root.children.find((p: FakeNode) => p.name === name);
  }
  /** All live nodes carrying a logical id for the project. */
  owned(projectId: string): FakeNode[] {
    return [...this.nodes.values()].filter((n) => !n.removed && n.getPluginData('magec.projectId') === projectId && n.getPluginData('magec.logicalId'));
  }
  byLogicalId(lid: string): FakeNode[] {
    return [...this.nodes.values()].filter((n) => !n.removed && n.getPluginData('magec.logicalId') === lid);
  }
}
