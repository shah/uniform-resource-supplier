import * as ur from "@shah/uniform-resource"

export interface ResourceFilterContext {

}

export interface UniformResourceFilter {
    retainOriginal?(ctx: ResourceFilterContext, resource: ur.UniformResource): boolean;
    retainTransformed?(ctx: ResourceFilterContext, resource: ur.UniformResource | ur.TransformedResource): boolean;
}

export interface UniformResourceFilterReporter {
    (ctx: ResourceFilterContext, resource: ur.UniformResource): void;
}

export function filterPipe(...chain: UniformResourceFilter[]): UniformResourceFilter {
    return new class implements UniformResourceFilter {
        retainOriginal(ctx: ResourceFilterContext, resource: ur.UniformResource): boolean {
            for (const c of chain) {
                if (c.retainOriginal) {
                    if (!c.retainOriginal(ctx, resource)) {
                        return false;
                    }
                }
            }
            return true;
        }

        retainTransformed(ctx: ResourceFilterContext, resource: ur.TransformedResource): boolean {
            for (const c of chain) {
                if (c.retainTransformed) {
                    if (!c.retainTransformed(ctx, resource)) {
                        return false;
                    }
                }
            }
            return true;
        }
    }()
}

export class FilteredResourcesCounter {
    readonly reporters: {
        [key: string]: {
            removedCount: number;
            reporter: UniformResourceFilterReporter
        }
    } = {};

    count(key: string): number {
        return this.reporters[key].removedCount;
    }

    reporter(key: string): UniformResourceFilterReporter {
        const reporter = (ctx: ResourceFilterContext, resource: ur.UniformResource): void => {
            this.reporters[key].removedCount++;
        }
        this.reporters[key] = {
            removedCount: 0,
            reporter: reporter
        }
        return reporter;
    }
}

export class BlankLabelFilter implements UniformResourceFilter {
    static readonly singleton = new BlankLabelFilter();

    constructor(readonly reporter?: UniformResourceFilterReporter) {
    }

    retainOriginal(ctx: ResourceFilterContext, resource: ur.UniformResource): boolean {
        if (typeof resource.label === "undefined" || resource.label.length == 0) {
            if (this.reporter) {
                this.reporter(ctx, resource);
            }
            return false;
        }
        return true;
    }
}

export class BrowserTraversibleFilter implements UniformResourceFilter {
    static readonly singleton = new BrowserTraversibleFilter();

    constructor(readonly reporter?: UniformResourceFilterReporter) {
    }

    retainOriginal(ctx: ResourceFilterContext, resource: ur.UniformResource): boolean {
        if (resource.uri.startsWith("mailto:")) {
            if (this.reporter) {
                this.reporter(ctx, resource);
            }
            return false;
        }
        return true;
    }
}

export interface ResourceSupplierContext {
}

export interface UniformResourcesSupplier {
    readonly isUniformResourceSupplier: true;
    resourceFromAnchor(
        ctx: ResourceSupplierContext,
        anchor: ur.HtmlAnchor): Promise<ur.UniformResource | undefined>
    forEachResource?(
        ctx: ResourceSupplierContext,
        urc: UniformResourceConsumer): Promise<void>;
}

export interface UniformResourceConsumer {
    (resource: ur.UniformResource): void;
}

export interface TypicalSupplierOptions {
    readonly provenanceURN: ur.UniformResourceName;
    readonly filter?: UniformResourceFilter;
    readonly unifResourceTr?: ur.UniformResourceTransformer;
}

export class TypicalResourcesSupplier implements ur.UniformResourceProvenance, UniformResourcesSupplier {
    readonly isUniformResourceSupplier = true;
    readonly provenanceURN: ur.UniformResourceName;
    readonly filter?: UniformResourceFilter;
    readonly unifResourceTr?: ur.UniformResourceTransformer;

    constructor({ provenanceURN, filter, unifResourceTr: transformer }: TypicalSupplierOptions) {
        this.provenanceURN = provenanceURN;
        this.filter = filter;
        this.unifResourceTr = transformer;
    }

    async resourceFromAnchor(ctx: ResourceSupplierContext, anchor: ur.HtmlAnchor): Promise<ur.UniformResource | undefined> {
        let original: ur.UniformResource = {
            isUniformResource: true,
            provenance: this,
            uri: anchor.href,
            label: anchor.label
        };
        if (this.filter && this.filter.retainOriginal) {
            if (!this.filter.retainOriginal(ctx, original)) {
                return undefined;
            }
        }
        if (this.unifResourceTr) {
            const transformed = await this.unifResourceTr.flow(ctx, original);
            if (this.filter && this.filter.retainTransformed) {
                if (!this.filter.retainTransformed(ctx, transformed)) {
                    return undefined;
                }
            }
            return transformed;
        } else {
            return original;
        }
    }
}

export interface HtmlContentSupplierOptions extends TypicalSupplierOptions {
}

export class HtmlContentResourcesSupplier extends TypicalResourcesSupplier {
    constructor(readonly htmlContent: ur.QueryableHtmlContent, readonly options: HtmlContentSupplierOptions) {
        super(options);
    }

    async forEachResource(ctx: ResourceSupplierContext, consume: UniformResourceConsumer): Promise<void> {
        const anchors = this.htmlContent.anchors();
        for (const anchor of anchors) {
            const ur = await this.resourceFromAnchor(ctx, anchor);
            if (ur) consume(ur);
        }
    }
}

export class EmailMessageResourcesSupplier extends HtmlContentResourcesSupplier {
}
