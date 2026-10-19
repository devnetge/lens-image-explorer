import assert from "node:assert/strict";
import { test } from "node:test";
import { createContainer } from "@k8slens/injectable";
import { askAiFunctionInjectionToken } from "@k8slens/ask-ai-contracts";
import {
  registryImageDetailsFunctionInjectableBunch,
  registryImageDetailsFunctionKind,
} from "../src/registry-query.injectable";

function registeredQuery() {
  const di = createContainer("image-registry-query-test");
  di.register(registryImageDetailsFunctionInjectableBunch);

  // Root-container inject2 returns the factory; instantiate-scoped inject uses this shape too.
  return di.inject2(askAiFunctionInjectionToken.for(registryImageDetailsFunctionKind).for([]))();
}

test("the registered Ask AI query preserves uncertainty for Docker Hub images", async () => {
  const result = await registeredQuery()({ imageReference: "nginx:1.27" });

  assert.equal(result.registry, "docker.io");
  assert.equal(result.visibility, "unknown");
  assert.ok(result.visibilityReason.length > 0);
});

test("the registered Ask AI query returns hostname evidence and the configured digest", async () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const result = await registeredQuery()({
    imageReference: `123456789012.dkr.ecr.eu-west-1.amazonaws.com/api@${digest}`,
  });

  assert.equal(result.visibility, "private");
  assert.equal(result.account, "123456789012");
  assert.equal(result.region, "eu-west-1");
  assert.equal(result.pinnedDigest, digest);
});

test("Ask AI keeps namespace aliases, implicit tags, and Google locations distinct", async () => {
  const describe = registeredQuery();
  const publicImage = await describe({ imageReference: "public.ecr.aws/example/app" });
  assert.equal(publicImage.account, "example");
  assert.equal(publicImage.tag, "(implicit)");
  assert.equal(publicImage.pinnedDigest, "");
  assert.equal(publicImage.visibility, "public");

  const googleImage = await describe({ imageReference: "europe-west1-docker.pkg.dev/my-project/releases/app:stable" });
  assert.equal(googleImage.region, "europe-west1");
  assert.equal(googleImage.project, "my-project");
  assert.equal(googleImage.visibility, "unknown");
});

test("invalid Ask AI inputs are rejected without reflecting credential-like text", async () => {
  const describe = registeredQuery();
  const credential = "example-password";
  const invalidInputs = [
    undefined,
    {},
    { imageReference: 123 },
    { imageReference: "" },
    { imageReference: "nginx latest" },
    { imageReference: `https://user:${credential}@registry.example.com/app` },
    { imageReference: `user:${credential}@registry.example.com/app` },
  ];

  for (const input of invalidInputs) {
    await assert.rejects(describe(input as { imageReference: string }), (error: Error) => {
      assert.doesNotMatch(error.message, new RegExp(credential));
      assert.match(error.message, /container image reference/);
      return true;
    });
  }
});
