import React, {Component} from 'react';
import {Paper, Typography} from "@material-ui/core";
import ReconnectingWebSocket from "reconnecting-websocket";
import * as PIXI from 'pixi.js';
import "./Main.css";

PIXI.settings.RESOLUTION = window.devicePixelRatio;
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

type BlockPtr = number;
type AttestationPtr = number;
type LatestVotesPtr = number;
type Gwei = number;
type Slot = number;
type ValidatorIndex = number;
type DepositIndex = number;
type CommitteeIndex = number;
type Root = string;

type FFG = {
    source: Gwei;
    target: Gwei;
    head: Gwei;
}

type ValidatorCounts = {
    total: number;
    active: number;
    slashed: number;
    eligible: number;
    nonEligible: number;
    exiting: number;
    withdrawable: number;
}

type Eth1Data = {
    depositRoot: Root;
    depositCount: DepositIndex;
    blockHash: Root;
}

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

type BlockSummary = {
    selfPtr: BlockPtr;
    hTR: Root;
    slot: Slot;
    parent: BlockPtr;
}

type AttestationSummary = {
    selfPtr: AttestationPtr;
    slot: Slot;
    commIndex: CommitteeIndex;
    head: BlockPtr;
    target: BlockPtr;
    source: BlockPtr;
}

type VoteSummary = {
    validatorIndex: ValidatorIndex;
    attestationPtr: AttestationPtr;
}

type MemoryState = {
    // ptrs rotate around buffer
    head: BlockPtr;       // index modulo HeadsMemory
    finalized: BlockPtr;       // index modulo FinalizedMemory
    blocks: BlockPtr;       // index modulo BlocksMemory
    attestations: AttestationPtr; // index modulo AttestationsMemory
    latestVotes: LatestVotesPtr; // index modulo LatestVotesMemory
}

type Memory = {
    nextDiffIndex: number;
    offsetState: MemoryState;
    headBuffer: Array<HeadSummary>;
    finalizedBuffer: Array<BlockPtr>;
    votesBuffer: Array<VoteSummary>;
    // other buffer data is put into Pixi objects
}

type MemoryDiff = {
    diffIndex: number;
    previous: MemoryState;
    head: Array<HeadSummary>;
    finalized: Array<BlockPtr>;
    blocks: Array<BlockSummary>;
    attestations: Array<AttestationSummary>;
    latestVotes: Array<VoteSummary>;
}

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

        const rectangle = new PIXI.Graphics();
        rectangle.lineStyle(1, 0x3300FF, 1);
        rectangle.beginFill(0xCCFF66);
        rectangle.drawRect(0, 0, 10.0, 10.0);
        rectangle.endFill();
        this.addChild(rectangle);
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
        const thisPos = this.toGlobal(this.position);
        let fade = 1.0;
        for (let vote of this.lastVotes) {
            g.moveTo(thisPos.x, thisPos.y);
            g.lineStyle(1, 0xaaaa00, fade);
            fade *= 0.7;
            const votePos = vote.toGlobal(vote.position);
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

        // TODO block sprite
        const rectangle = new PIXI.Graphics();
        rectangle.lineStyle(1, 0xFF3300, 1);
        rectangle.beginFill(0x66CCFF);
        rectangle.drawRect(0, 0, 10.0, 10.0);
        rectangle.endFill();
        this.addChild(rectangle);
        this.width = 10;
        this.height = 10;
    }

    drawParentRelation(g: PIXI.Graphics, getParent: (parentPtr: BlockPtr) => PixiBlock | null) {
        const parent = getParent(this.block.parent);
        if (parent === null) {
            // TODO: maybe draw something to indicate the parent was pruned?
            return
        }
        g.moveTo(this.x, this.y);
        g.lineStyle(1, 0xffffff, 1);
        g.lineTo(parent.x, parent.y);
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

        // TODO attestation sprite
        const rectangle = new PIXI.Graphics();
        rectangle.lineStyle(1, 0x33FF00, 1);
        rectangle.beginFill(0xFFCC66);
        rectangle.drawRect(0, 0, 5.0, 5.0);
        rectangle.endFill();
        this.addChild(rectangle);
    }

    // draw a line between attestation and block
    drawBlockRelation(g: PIXI.Graphics) {
        const attPos = this.toGlobal(this.position);

        // Source
        if (this.source) {
            const sourcePos = this.source.toGlobal(this.source.position);
            g.moveTo(attPos.x, attPos.y);
            g.lineStyle(1, 0xff0000, 1);
            g.lineTo(sourcePos.x, sourcePos.y);
        }

        // Target
        if (this.target) {
            const targetPos = this.target.toGlobal(this.target.position);
            g.moveTo(attPos.x, attPos.y);
            g.lineStyle(1, 0x00ff00, 1);
            g.lineTo(targetPos.x, targetPos.y);
        }
        // Head
        if (this.head) {
            const headPos = this.head.toGlobal(this.head.position);
            g.moveTo(attPos.x, attPos.y);
            g.lineStyle(1, 0x0000ff, 1);
            g.lineTo(headPos.x, headPos.y);
        }
    }
}

class World {
    app: PIXI.Application;

    valCount: number = 0;
    valGridWidth: number = 100;
    valGridHeight: number = 100;

    blocks: PIXI.Container;
    attestations: PIXI.Container;
    validators: PIXI.Container;

    relationLines: PIXI.Graphics;

    memory: Memory;

    constructor(app: PIXI.Application, memory: Memory) {
        this.app = app;
        this.memory = memory;

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

        const lastHead = this.memory.headBuffer.length > 0 ? this.memory.headBuffer[this.memory.headBuffer.length - 1] : null;
        this.valCount = lastHead?.validatorCounts?.total || 0;

        // put initial validators into view
        this.updateValSet(this.valCount)
    }

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
        const margin = 40;
        const minGridWidth = 100;
        // sqrt * 1.5: spread over rectangular area, but not completely square preferably.
        const desiredWidth = Math.min(Math.floor(Math.sqrt(valCount) * 1.5), minGridWidth);
        const effectiveAppWidth = (this.app.view.width - (margin * 2));
        const valBoxSize = Math.min(Math.floor(effectiveAppWidth / desiredWidth), 1);
        const width = Math.min(Math.floor(effectiveAppWidth / valBoxSize), minGridWidth);
        const height = Math.ceil(valCount / width);
        let fromValIndex = 0;
        // check if grid dimensions have changed
        if (this.valGridWidth === width && this.valGridHeight === height) {
            // only update positions of new validators if the grid dimensions have not changed.
            fromValIndex = this.valCount;
        }
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
        if (this.memory.nextDiffIndex < diff.diffIndex) {
            return 'too_new';
        }
        if (this.memory.nextDiffIndex > diff.diffIndex) {
            return 'too_old';
        }

        this.memory.headBuffer.push(...diff.head);

        let maxValCount = this.valCount;
        for (let head of diff.head) {
            if (head.validatorCounts.total > maxValCount) maxValCount = head.validatorCounts.total;
        }
        // add new validators
        if (maxValCount !== this.valCount) {
            this.updateValSet(maxValCount);
        }

        this.memory.finalizedBuffer.push(...diff.finalized);

        // add new blocks
        for (let b of diff.blocks) {
            this.blocks.addChild(new PixiBlock(b));
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

        this.memory.nextDiffIndex += 1;
        return 'ok';
    }

    layoutDag() {
        // TODO move blocks to correct positions
        // TODO move attestations around the blocks
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
        let obj = JSON.parse(msg);
        console.log(obj);
        // TODO: parse into memory diff object
        // TODO: update world with memory diff
    };

    componentDidMount() {
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
        // TODO scale stage to fix resolution problems

        // TODO load from JSON http request
        const memory: Memory = {};
        this.world = new World(app, memory);

        this._pixiContainer.appendChild(app.view);

        // TODO start rendering loop for pixi ("request frame" loop to play nice with the browser?)
    }

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
