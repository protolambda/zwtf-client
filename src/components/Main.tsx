import React, {Component} from 'react';
import {Paper, Typography} from "@material-ui/core";
import ReconnectingWebSocket from "reconnecting-websocket";
import * as PIXI from 'pixi.js';
import {JsonDecoder, Result as JsonResult, Ok as JsonOk, Err as JsonErr} from "ts.data.json";
import "./Main.css";

PIXI.settings.RESOLUTION = window.devicePixelRatio;

type BlockPtr = number;
type AttestationPtr = number;
type LatestVotesPtr = number;
type Gwei = number;
type Slot = number;
type ValidatorIndex = number;
type DepositIndex = number;
type CommitteeIndex = number;
type Root = string;

const decBlockPtr = JsonDecoder.number;
const decAttestationPtr = JsonDecoder.number;
const decLatestVotesPtr = JsonDecoder.number;
const decGwei = JsonDecoder.number;
const decSlot = JsonDecoder.number;
const decValidatorIndex = JsonDecoder.number;
const decDepositIndex = JsonDecoder.number;
const decCommitteeIndex = JsonDecoder.number;
const decRoot = JsonDecoder.string;

type FFG = {
    source: Gwei;
    target: Gwei;
    head: Gwei;
}

const decFFG = JsonDecoder.object<FFG>({
    source: decGwei,
    target: decGwei,
    head: decGwei,
}, 'ffg');

type ValidatorCounts = {
    total: number;
    active: number;
    slashed: number;
    eligible: number;
    nonEligible: number;
    exiting: number;
    withdrawable: number;
}

const decValidatorCounts = JsonDecoder.object<ValidatorCounts>({
    total: JsonDecoder.number,
    active: JsonDecoder.number,
    slashed: JsonDecoder.number,
    eligible: JsonDecoder.number,
    nonEligible: JsonDecoder.number,
    exiting: JsonDecoder.number,
    withdrawable: JsonDecoder.number,
}, 'validator_counts');

type Eth1Data = {
    depositRoot: Root;
    depositCount: DepositIndex;
    blockHash: Root;
}

const decEth1Data = JsonDecoder.object<Eth1Data>({
    depositRoot: decRoot,
    depositCount: decDepositIndex,
    blockHash: decRoot,
}, 'eth1_data');

type HeadSummary = {
    headBlock: BlockPtr;
    slot: Slot;
    proposerIndex: ValidatorIndex;
    validatorCounts: ValidatorCounts;
    totalStaked: Gwei;
    avgBalance: Gwei;
    depositIndex: DepositIndex;
    eth1Data: Eth1Data;
    previousFFG: FFG;
    currentFFG: FFG;
}

const decHeadSummary = JsonDecoder.object<HeadSummary>({
    headBlock: decBlockPtr,
    slot: decSlot,
    proposerIndex: decValidatorIndex,
    validatorCounts: decValidatorCounts,
    totalStaked: decGwei,
    avgBalance: decGwei,
    depositIndex: decDepositIndex,
    eth1Data: decEth1Data,
    previousFFG: decFFG,
    currentFFG: decFFG,
}, 'head_summary');

type BlockSummary = {
    selfPtr: BlockPtr;
    htr: Root;
    slot: Slot;
    parent: BlockPtr;
}

const decBlockSummary = JsonDecoder.object<BlockSummary>({
    selfPtr: decBlockPtr,
    htr: decRoot,
    slot: decSlot,
    parent: decBlockPtr,
}, 'block_summary');

type AttestationSummary = {
    selfPtr: AttestationPtr;
    slot: Slot;
    commIndex: CommitteeIndex;
    head: BlockPtr;
    target: BlockPtr;
    source: BlockPtr;
}

const decAttestationSummary = JsonDecoder.object<AttestationSummary>({
    selfPtr: decAttestationPtr,
    slot: decSlot,
    commIndex: decCommitteeIndex,
    head: decBlockPtr,
    target: decBlockPtr,
    source: decBlockPtr,
}, 'attestation_summary');

type VoteSummary = {
    validatorIndex: ValidatorIndex;
    attestationPtr: AttestationPtr;
}

const decVoteSummary = JsonDecoder.object<VoteSummary>({
    validatorIndex: decValidatorIndex,
    attestationPtr: decAttestationPtr,
}, 'vote_summary');

type MemoryState = {
    // ptrs rotate around buffer
    head: BlockPtr;       // index modulo HeadsMemory
    finalized: BlockPtr;       // index modulo FinalizedMemory
    blocks: BlockPtr;       // index modulo BlocksMemory
    attestations: AttestationPtr; // index modulo AttestationsMemory
    latestVotes: LatestVotesPtr; // index modulo LatestVotesMemory
}

const decMemoryState = JsonDecoder.object<MemoryState>({
    head: decBlockPtr,
    finalized: decBlockPtr,
    blocks: decBlockPtr,
    attestations: decAttestationPtr,
    latestVotes: decLatestVotesPtr,
}, 'memory_state');

type MemoryDiff = {
    diffIndex: number;
    previous: MemoryState;
    head: Array<HeadSummary>;
    finalized: Array<BlockPtr>;
    blocks: Array<BlockSummary>;
    attestations: Array<AttestationSummary>;
    latestVotes: Array<VoteSummary>;
}

const decMemoryDiff = JsonDecoder.object<MemoryDiff>({
    diffIndex: JsonDecoder.number,
    previous: decMemoryState,
    head: JsonDecoder.array<HeadSummary>(decHeadSummary, 'head'),
    finalized:  JsonDecoder.array<BlockPtr>(decBlockPtr, 'finalized'),
    blocks:  JsonDecoder.array<BlockSummary>(decBlockSummary, 'blocks'),
    attestations:  JsonDecoder.array<AttestationSummary>(decAttestationSummary, 'attestations'),
    latestVotes: JsonDecoder.array<VoteSummary>(decVoteSummary, 'latest_votes'),
}, 'memory_diff');

const ZERO_POS = new PIXI.Point(0, 0);

class PixiValidator extends PIXI.Container {
    index: number;
    lastVotes: Array<PixiAttestation>;

    constructor(index: number) {
        super();
        this.index = index;
        this.name = "val_" + index;
        this.lastVotes = new Array<PixiAttestation>();

        // TODO validator sprite
        // emoji for status?
        // size for balance?
        // fade for inactive validators?

        const img = new PIXI.Sprite(PIXI.Texture.from("validator"));
        this.addChild(img);
        this.width = 10;
        this.height = 10;
    }

    addVote(att: PixiAttestation) {
        this.lastVotes.push(att);
        this.lastVotes = this.lastVotes.sort((a, b) => a.attestation.target - b.attestation.target);
        // only keep track of last 3 votes
        if (this.lastVotes.length > 3) {
            this.lastVotes = this.lastVotes.slice(0, 3);
        }
    }

    // draw a line between validator and attestation
    drawVoteRelation(g: PIXI.Graphics) {
        if (this.lastVotes.length == 0) {
            // or maybe draw an idle icon?
            return;
        }
        const thisPos = this.toGlobal(ZERO_POS);
        let fade = 1.0;
        for (let vote of this.lastVotes) {
            g.moveTo(thisPos.x, thisPos.y);
            g.lineStyle(1, 0xaaaa00, fade);
            fade *= 0.7;
            const votePos = vote.toGlobal(ZERO_POS);
            // TODO: line not visible
            // console.log("vote relation: ", thisPos.x, thisPos.y, votePos.x, votePos.y);
            g.lineTo(votePos.x, votePos.y);
        }
    }
}

class PixiBlock extends PIXI.Container {
    block: BlockSummary;

    constructor(block: BlockSummary) {
        super();
        this.block = block;
        this.name = "block_" + block.selfPtr;

        const blockImg = new PIXI.Sprite(PIXI.Texture.from("block"));
        this.addChild(blockImg);
        this.width = 10;
        this.height = 10;
    }

    drawParentRelation(g: PIXI.Graphics, getParent: (parentPtr: BlockPtr) => PixiBlock | null) {
        const parent = getParent(this.block.parent);
        if (parent === null) {
            console.log("null parent");
            // TODO: maybe draw something to indicate the parent was pruned?
            return
        }
        const thisPos = this.toGlobal(ZERO_POS);
        g.moveTo(thisPos.x, thisPos.y);
        g.lineStyle(1, 0xffffff, 1.0);
        const parentPos = parent.toGlobal(ZERO_POS);
        g.lineTo(parentPos.x, parentPos.y);
    }
}

class PixiAttestation extends PIXI.Container {
    attestation: AttestationSummary;
    source: PixiBlock | null;
    target: PixiBlock | null;
    head: PixiBlock | null;

    constructor(attestation: AttestationSummary, source: PixiBlock | null, target: PixiBlock | null, head: PixiBlock | null) {
        super();
        this.attestation = attestation;
        this.source = source;
        this.target = target;
        this.head = head;
        this.name = "att_" + attestation.selfPtr;

        const blockImg = new PIXI.Sprite(PIXI.Texture.from("attestation"));
        this.addChild(blockImg);
        this.width = 7;
        this.height = 7;
    }

    // draw a line between attestation and block
    drawBlockRelation(g: PIXI.Graphics) {
        const attPos = this.toGlobal(ZERO_POS);

        // Source
        if (this.source) {
            const sourcePos = this.source.toGlobal(ZERO_POS);
            g.moveTo(attPos.x, attPos.y);
            g.lineStyle(1, 0xff0000, 1.0);
            g.lineTo(sourcePos.x, sourcePos.y);
        }

        // Target
        if (this.target) {
            const targetPos = this.target.toGlobal(ZERO_POS);
            g.moveTo(attPos.x, attPos.y);
            g.lineStyle(1, 0x00ff00, 1.0);
            g.lineTo(targetPos.x, targetPos.y);
        }
        // Head
        if (this.head) {
            const headPos = this.head.toGlobal(ZERO_POS);
            g.moveTo(attPos.x, attPos.y);
            g.lineStyle(1, 0x0000ff, 1.0);
            g.lineTo(headPos.x, headPos.y);
        }
    }
}

type TreeEntry = {
    parent: BlockPtr;
    slot: Slot;
    children: Array<BlockPtr>;
}

class World {
    app: PIXI.Application;

    valCount: number = 0;
    valGridWidth: number = 100;
    valGridHeight: number = 100;

    blocks: PIXI.Container;
    attestations: PIXI.Container;
    validators: PIXI.Container;

    head: Array<HeadSummary> = [];
    finalized: Array<BlockPtr> = [];

    relationLines: PIXI.Graphics;

    tree: Record<BlockPtr, TreeEntry> = {};

    nextDiffIndex: number | null = null;

    constructor(app: PIXI.Application) {
        this.app = app;

        app.stage.interactive = true;
        app.stage.buttonMode = true;
        app.stage.on('click', this.onClick);

        // Pixi black magic: make background and click events consistent with a view-port filling rectangle.
        const rect = new PIXI.Graphics()
            .beginFill(0x000000)
            .drawRect(0, 0, this.app.view.width, this.app.view.height)
            .endFill();

        this.app.stage.addChild(rect);

        this.validators = new PIXI.Container();
        app.stage.addChild(this.validators);
        this.validators.on('click', (obj: PixiValidator) => {
            console.log("clicked validator: ", obj);
        });

        this.blocks = new PIXI.Container();
        app.stage.addChild(this.blocks);
        this.blocks.on('click', (obj: PixiBlock) => {
            console.log("clicked block: ", obj);
        });

        this.attestations = new PIXI.Container();
        app.stage.addChild(this.attestations);
        this.attestations.on('click', (obj: PixiAttestation) => {
            console.log("clicked attestation: ", obj);
        });

        this.relationLines = new PIXI.Graphics();
        this.relationLines.width = app.view.width;
        this.relationLines.height = app.view.height;
        // this.relationLines.position.set(app.view.width * 0.5, app.view.height * 0.5);
        this.app.stage.addChild(this.relationLines);

        // put initial validators into view
        this.updateValSet(this.valCount)
    }

    // TODO: add pruning function


    updateValSet(newValCount: number) {
        // add new validators
        for (let vi = this.valCount; vi < newValCount; vi++) {
            const val = new PixiValidator(vi);
            this.validators.addChild(val);
        }

        this.updateValGridSize(newValCount);
        this.valCount = newValCount;
    }

    updateValGridSize(valCount: number) {
        const margin = 20;
        // sqrt * 1.5: spread over rectangular area, but not completely square preferably.
        const desiredWidth = Math.floor(Math.sqrt(valCount) * 1.5);
        const minWidth = Math.floor(Math.sqrt(valCount) * 0.5);
        const effectiveAppWidth = (this.app.view.width - (margin * 2));
        const valBoxSize = Math.max(Math.floor(effectiveAppWidth / desiredWidth), 6);
        const width = Math.max(Math.floor(effectiveAppWidth / valBoxSize), minWidth);
        const height = Math.ceil(valCount / width);
        let fromValIndex = 0;
        // check if grid dimensions have changed
        if (this.valGridWidth === width && this.valGridHeight === height) {
            // only update positions of new validators if the grid dimensions have not changed.
            fromValIndex = this.valCount;
        }
        this.validators.position.set(margin, margin);
        for (let i = fromValIndex; i < valCount; i++) {
            const val = this.validators.getChildByName("val_" + i);
            const x = i % width;
            const y = Math.floor(i / width);
            val.position.set(x * valBoxSize, y * valBoxSize);
        }
        this.valGridWidth = width;
        this.valGridHeight = height;
    }

    // update the world contents, return too_old|ok|too_new based on diff aligning to current state.
    updateWorld(diff: MemoryDiff): 'too_old' | 'ok' | 'too_new' {
        if (this.nextDiffIndex != null) {
            if (this.nextDiffIndex < diff.diffIndex) {
                return 'too_new';
            }
            if (this.nextDiffIndex > diff.diffIndex) {
                return 'too_old';
            }
        }

        this.head.push(...diff.head);

        let maxValCount = this.valCount;
        for (let head of diff.head) {
            if (head.validatorCounts.total > maxValCount) maxValCount = head.validatorCounts.total;
        }
        // add new validators
        if (maxValCount !== this.valCount) {
            this.updateValSet(maxValCount);
        }

        this.finalized.push(...diff.finalized);

        // add new blocks
        for (let b of diff.blocks) {
            this.blocks.addChild(new PixiBlock(b));

            const prevSelf = this.tree[b.selfPtr];
            if(prevSelf) {
                prevSelf.parent = b.parent;
                prevSelf.slot = b.slot;
            } else {
                this.tree[b.selfPtr] = {
                    parent: b.parent,
                    slot: b.slot,
                    children: [b.selfPtr]
                }
            }
            const prevParent = this.tree[b.parent];
            if (prevParent) {
                if (!prevSelf || prevSelf.parent == 0) { // don't add twice, only when new or previously unset
                    prevParent.children.push(b.selfPtr)
                }
            } else {
                this.tree[b.parent] = {
                    parent: 0,
                    slot: 0,
                    children: [b.selfPtr]
                }
            }
        }
        // add new attestations
        for (let a of diff.attestations) {
            this.attestations.addChild(new PixiAttestation(a,
                this.getBlock(a.source), this.getBlock(a.target), this.getBlock(a.head)));
        }
        // TODO: layout blocks and attestations (batched)
        for (let vote of diff.latestVotes) {
            const val = this.getValidator(vote.validatorIndex);
            if (val === null) {
                continue;
            }
            const att = this.getAttestation(vote.attestationPtr);
            if (att === null) {
                continue;
            }
            val.addVote(att);
        }

        this.layoutDag();
        this.drawRelations();

        this.nextDiffIndex = diff.diffIndex + 1;
        return 'ok';
    }

    layoutDag() {
        // order index of each block within their slot
        const order: Record<BlockPtr, number> = {};
        // blocks known for each slot
        const slotHeights: Record<Slot, number> = {};

        const head = this.head[this.head.length-1];
        if (!head) {
            return
        }
        order[head.headBlock] = 0;

        const process_block = (b: BlockPtr) => {
            const treeData = this.tree[b];
            if (!treeData) {
                return
            }
            if (slotHeights.hasOwnProperty(treeData.slot)) {
                slotHeights[treeData.slot] += 1
            } else {
                slotHeights[treeData.slot] = 1
            }
            order[b] = slotHeights[treeData.slot] - 1;
            for (let child of treeData.children) {
                if (!order.hasOwnProperty(child)) {
                    process_block(child)
                }
            }
        };
        // walk from the head back up the tree, and order blocks as we go.
        // Every time we find unseen children nodes, we order them up later in the slot column.
        let block = head.headBlock;
        while (true) {
            const treeData = this.tree[block];
            if(!treeData) {
                break
            }
            process_block(block);
            block = treeData.parent;
            if(block == 0) {
                break;
            }
        }
        // move blocks to their position
        const slotWidth = 30;
        const slotHeight = 40;
        for (let block of this.blocks.children) {
            const blockSummary = (block as PixiBlock).block;
            const slotOrder = order[blockSummary.selfPtr];
            block.position.set(blockSummary.slot * slotWidth, slotOrder * slotHeight);
            // console.log("block ", blockSummary.selfPtr, " at ", block.position.x, block.position.y);
        }
        const attOffsetX = 10;
        const attOffsetY = 8;
        const attCounts: Record<BlockPtr, number> = {};
        for (let att of this.attestations.children) {
            const attSummary = (att as PixiAttestation).attestation;
            if (attCounts.hasOwnProperty(attSummary.head)) {
                attCounts[attSummary.head] += 1
            } else {
                attCounts[attSummary.head] = 1
            }
            let slotOrder = 0;
            if (order.hasOwnProperty(attSummary.head)) {
                slotOrder = order[attSummary.head];
            }
            const attOrder = attCounts[attSummary.head] - 1;
            // offset-y a little for each attestation that is part of the block
            att.position.set(attSummary.slot * slotWidth + attOffsetX, slotOrder * slotHeight + (attOrder * attOffsetY));
            // console.log("att ", attSummary.selfPtr, " at ", att.position.x, att.position.y);
        }
        const dagOffsetY = Math.floor(this.app.view.height * 0.8);
        // console.log("dagOffsetY: ", dagOffsetY);
        this.attestations.position.set(-head.slot * slotWidth + this.app.view.width * 0.5, dagOffsetY);
        this.blocks.position.set(-head.slot * slotWidth + this.app.view.width * 0.5, dagOffsetY);
        // console.log("blocks at ", this.blocks.position.x, this.blocks.position.y);
    }

    getBlock = (blockPtr: BlockPtr): PixiBlock | null => {
        return this.blocks.getChildByName("block_"+blockPtr) as (PixiBlock | null);
    };
    getAttestation = (attPtr: AttestationPtr): PixiAttestation | null => {
        return this.attestations.getChildByName("att_"+attPtr) as (PixiAttestation | null);
    };
    getValidator = (vi: ValidatorIndex): PixiValidator | null => {
        return this.validators.getChildByName("val_"+vi) as (PixiValidator | null);
    };

    drawRelations() {
        // this.relationLines.clear();
        for (let block of this.blocks.children) {
            (block as PixiBlock).drawParentRelation(this.relationLines, this.getBlock);
        }
        for (let val of this.validators.children) {
            (val as PixiValidator).drawVoteRelation(this.relationLines);
        }
        for (let att of this.attestations.children) {
            (att as PixiAttestation).drawBlockRelation(this.relationLines);
        }
    }

    onClick = (e: any) => {
        const pos = e.data.getLocalPosition(this.app.stage);
        console.log("click event: ", pos);
    };

}

type MainState = {
    loaded: boolean,
    wsOpen: boolean,
}

interface MainProps {

}

type WSCloser = () => void;

export class Main extends Component<MainProps, MainState> {

    private _sendWS: undefined | ((msg: ArrayBufferView) => void);
    private _closeWS: undefined | WSCloser;

    private _pixiContainer: null | HTMLDivElement = null;
    private world: undefined | World;

    state: Readonly<MainState> = {
        loaded: false,
        wsOpen: false,
    };

    constructor(props: MainProps) {
        super(props);
        this.setupWS();
    }

    onStatusWS = (open: boolean) => {
        this.setState({
            wsOpen: open,
        })
    };

    setupWS = () => {
        const rws = new ReconnectingWebSocket('ws://localhost:4000/ws', [], {debug: true});
        rws.addEventListener('close', () => this.onStatusWS(false));
        rws.addEventListener('open', () => this.onStatusWS(true));
        rws.addEventListener('message', this.onMessageEvent);
        this._sendWS = rws.send.bind(rws);
        this._closeWS = () => {
            this._sendWS = undefined;
            rws.close();
        };
    };

    sendWSMsg = ((msg: DataView) => {
        if (this._sendWS) {
            console.log("sending msg: ", msg);
            this._sendWS(msg);
        } else {
            console.log("not connected to WS, could not send msg: ", msg);
        }
    });

    onMessageEvent = (ev: MessageEvent) => {
        const msg: string = ev.data;
        console.log("received msg: ", msg);
        const msgData: any = JSON.parse(msg);
        const diffRes: JsonResult<MemoryDiff> = decMemoryDiff.decode(msgData);
        if (diffRes instanceof JsonOk) {
            const diff = (diffRes as JsonOk<MemoryDiff>).value;
            if (this.world) {
                this.world.updateWorld(diff);
            } else {
                console.log("cannot process diff; uninitialized world");
            }
        } else {
            const err = (diffRes as JsonErr<MemoryDiff>).error;
            console.log('could not decode memory diff to update world', err);
        }
    };

    componentDidMount() {
        // TODO scale stage to fix resolution problems
        const loader = PIXI.Loader.shared;
        PIXI.Loader.registerPlugin(PIXI.TextureLoader);

        loader
            .add('block', "block.png")
            .add('attestation', "attestation.png")
            .add('validator', "validator.png")
            .load((loader: PIXI.Loader, resources: Partial<Record<string, PIXI.LoaderResource>>) => {
                this.setupWorld();
            })
            .onError.add(() => {
                console.log("failed to load resources")
            });
    }

    setupWorld = () => {
        if (this._pixiContainer === null) {
            console.log("Error: component mounted before pixi container ref was completed.");
            return
        }

        const app = new PIXI.Application({
            backgroundColor: 0xaaaaff,
            width: (this._pixiContainer.offsetWidth || 500),
            height: (this._pixiContainer.offsetHeight || 500),
            sharedLoader: true,
            sharedTicker: true
        });

        this.world = new World(app);

        this._pixiContainer.appendChild(app.view);

        // TODO start rendering loop for pixi ("request frame" loop to play nice with the browser?)
    };

    render() {
        return (
            <div className="main-root">
                <Paper className="overlay infoOverlay">
                    <Typography component="p">
                        Work in progress
                    </Typography>
                </Paper>

                <div className="pixi-scene" ref={(el) => {
                    this._pixiContainer = el
                }}/>
            </div>
        )
    }
}
