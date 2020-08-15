import * as ur from "@shah/uniform-resource";
import { Expect, Test, TestCase, TestFixture, Timeout } from "alsatian";
import * as fs from "fs";
import mime from "whatwg-mimetype";
import * as urs from "./uniform-resource-supplier";
import * as p from "@shah/ts-pipe";

@TestFixture("Uniform Resource Test Suite")
export class TestSuite {
    @TestCase("provenance-email-base64.spec.txt")
    @Test("Base 64 Encoded E-mail Body")
    @Timeout(30000)
    //@IgnoreTest("Temporary, this takes time to run")
    async testBase64EncodedEmail(base64EncodedHtmlFileName: string): Promise<void> {
        const base64Content = fs.readFileSync(base64EncodedHtmlFileName);
        Expect(base64Content).toBeDefined();

        const testURN = `test:${base64EncodedHtmlFileName}`;
        const frc = new urs.FilteredResourcesCounter();
        const contentPipe = p.pipe(ur.EnrichQueryableHtmlContent.singleton);
        const htmlContent = await contentPipe.flow({
            uri: testURN,
            htmlSource: Buffer.from(base64Content.toString(), 'base64').toString()
        }, {
            contentType: "text/html",
            mimeType: new mime("text/html")
        }) as ur.QueryableHtmlContent;
        const emrs = new urs.EmailMessageResourcesSupplier(htmlContent, {
            provenanceURN: testURN,
            filter: urs.filterPipe(
                new urs.BlankLabelFilter(frc.reporter("Blank label")),
                new urs.BrowserTraversibleFilter(frc.reporter("Not traversible"))),
            unifResourceTr: p.pipe(
                ur.RemoveLabelLineBreaksAndTrimSpaces.singleton,
                ur.FollowRedirectsGranular.singleton,
                ur.RemoveTrackingCodesFromUrl.singleton)
        });

        const retained: ur.UniformResource[] = [];
        const ctx: ur.ResourceTransformerContext = {
            isUniformResourceContext: true
        }
        await emrs.forEachResource(ctx, (resource: ur.UniformResource): void => {
            retained.push(resource);
            if (ur.isTransformedResource(resource)) {
                console.log(`[${resource.label}] ${ur.allTransformationRemarks(resource).join(" | ")} (${resource.pipePosition})`, resource.uri);
            } else {
                console.log(`[${resource.label}] no transformations`, resource.uri);
            }
        });
        Expect(frc.count("Blank label")).toBe(9);
        Expect(frc.count("Not traversible")).toBe(3);
        Expect(retained.length).toBe(12);
    }
}
