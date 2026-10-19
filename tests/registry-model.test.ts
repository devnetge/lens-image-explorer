import assert from "node:assert/strict";
import { test } from "node:test";
import { describeRegistry } from "../src/registry-model.ts";

const digest = `sha256:${"a".repeat(64)}`;

test("Docker shorthand and aliases normalize without claiming visibility", () => {
  for (const image of ["nginx", "docker.io/nginx", "index.docker.io/nginx", "registry-1.docker.io/nginx"]) {
    const details = describeRegistry(image);
    assert.equal(details.provider, "docker-hub", image);
    assert.equal(details.registry, "docker.io", image);
    assert.equal(details.repository, "library/nginx", image);
    assert.equal(details.tag, "(implicit)", image);
    assert.equal(details.visibility, "unknown", image);
  }
  const namespaced = describeRegistry(`team/api:Release_1@${digest}`);
  assert.equal(namespaced.repository, "team/api");
  assert.equal(namespaced.tag, "Release_1");
  assert.equal(namespaced.pinnedDigest, digest);
  assert.equal(namespaced.account, "team");
  assert.match(namespaced.tooltip, /Registry: docker\.io/);
  assert.match(namespaced.tooltip, /Tag: Release_1/);
  assert.ok(namespaced.tooltip.includes(`Pinned digest: ${digest}`));
  assert.match(namespaced.tooltip, /no registry access check was performed/);
});

test("documented AWS private registry endpoints expose account and region evidence", () => {
  const endpoints = [
    ["123456789012.dkr.ecr.us-east-1.amazonaws.com", "us-east-1"],
    ["123456789012.dkr.ecr.us-gov-west-1.amazonaws.com", "us-gov-west-1"],
    ["123456789012.dkr.ecr-fips.us-east-2.amazonaws.com", "us-east-2"],
    ["123456789012.dkr-ecr.eu-west-1.on.aws", "eu-west-1"],
    ["123456789012.dkr-ecr-fips.us-gov-east-1.on.aws", "us-gov-east-1"],
    ["123456789012.dkr.ecr.cn-north-1.amazonaws.com.cn", "cn-north-1"],
    ["123456789012.dkr.ecr.cn-northwest-1.amazonaws.com.cn", "cn-northwest-1"],
  ];
  for (const [registry, region] of endpoints) {
    const details = describeRegistry(`${registry}/team/api:stable`);
    assert.equal(details.provider, "aws-ecr", registry);
    assert.equal(details.visibility, "private", registry);
    assert.equal(details.account, "123456789012", registry);
    assert.equal(details.region, region, registry);
    assert.equal(details.repository, "team/api", registry);
    assert.match(details.tooltip, /documented Amazon ECR private registry endpoint/, registry);
    assert.ok(details.tooltip.includes(`Registry: ${registry}`), registry);
    assert.ok(details.tooltip.includes(`Region / location: ${region}`), registry);
    assert.match(details.tooltip, /current pull permissions were not checked/, registry);
  }
});

test("only the exact supported ECR Public endpoint claims public visibility", () => {
  const details = describeRegistry(`PUBLIC.ECR.AWS/example/api@${digest}`);
  assert.equal(details.provider, "aws-ecr-public");
  assert.equal(details.registry, "public.ecr.aws");
  assert.equal(details.repository, "example/api");
  assert.equal(details.visibility, "public");
  assert.match(details.visibilityReason, /current availability were not checked/);
  assert.equal(describeRegistry("ecr-public.aws.com/example/api:latest").visibility, "unknown");
});

test("recognized providers never turn hostname recognition into repository permission claims", () => {
  const cases = [
    ["docker.io/library/nginx:latest", "docker-hub"],
    ["GHCR.IO/owner/api:v1", "github-container-registry"],
    ["quay.io/owner/api:v1", "quay"],
    ["myregistry-abc123.azurecr.io/team/api:v1", "azure-container-registry"],
    ["us-west1-docker.pkg.dev/my-project/images/api:v1", "google-artifact-registry"],
    ["us-docker.pkg.dev/google-samples/containers/gke/hello-app:1.0", "google-artifact-registry"],
    ["gcr.io/my-project/api:v1", "google-container-registry"],
    ["us.gcr.io/my-project/api:v1", "google-container-registry"],
    ["eu.gcr.io/my-project/api:v1", "google-container-registry"],
    ["asia.gcr.io/my-project/api:v1", "google-container-registry"],
  ];
  for (const [image, provider] of cases) {
    const details = describeRegistry(image);
    assert.equal(details.provider, provider, image);
    assert.equal(details.visibility, "unknown", image);
    assert.match(details.tooltip, /Visibility: Unknown/, image);
    assert.match(details.visibilityReason, /no registry access check/, image);
  }
  const google = describeRegistry("europe-west1-docker.pkg.dev/my-project/my-repo/api:v1");
  assert.equal(google.project, "my-project");
  assert.equal(google.region, "europe-west1");
  assert.match(google.tooltip, /Project: my-project/);
  assert.equal(describeRegistry("gcr.io/example.com/my-project/api:v1").project, "example.com:my-project");
});

test("provider suffix matches are anchored and unsupported ECR patterns remain unknown", () => {
  const registries = [
    "public.ecr.aws.attacker.example", "attacker.public.ecr.aws", "notpublic.ecr.aws",
    "ghcr.io.attacker.example", "attacker.ghcr.io", "quay.io.attacker.example",
    "docker.io.attacker.example", "attacker.gcr.io", "us-docker.pkg.dev.attacker.example",
    "foo.azurecr.io.attacker.example", "extra.foo.azurecr.io",
    "123456789012.dkr.ecr.us-east-1.amazonaws.com.attacker.example",
    "x123456789012.dkr.ecr.us-east-1.amazonaws.com",
    "123.dkr.ecr.us-east-1.amazonaws.com",
    "123456789012.dkr.ecr.made-up-1.amazonaws.com",
    "123456789012.dkr.ecr.cn-north-1.amazonaws.com",
    "123456789012.dkr.ecr.us-east-1.amazonaws.com.cn",
    "123456789012.dkr.ecr-fips.eu-west-1.amazonaws.com",
    "123456789012.dkr-ecr.cn-north-1.on.aws",
    "123456789012.dkr-ecr.us-east-1.on.aws.attacker.example",
  ];
  for (const registry of registries) {
    const details = describeRegistry(`${registry}/team/api:v1`);
    assert.equal(details.provider, "unknown", registry);
    assert.equal(details.visibility, "unknown", registry);
  }
});

test("custom registries, localhost, ports and IPv6 retain identity with unknown visibility", () => {
  for (const registry of [
    "localhost", "localhost:5000", "registry.example:5443", "192.0.2.10:5000",
    "[fd00::1]:5000", "[2001:db8::1]", "[::ffff:192.0.2.1]:5000",
    "public.ecr.aws:443", "123456789012.dkr.ecr.us-east-1.amazonaws.com:443",
  ]) {
    const details = describeRegistry(`${registry}/team/api:stable@${digest}`);
    assert.equal(details.provider, "unknown", registry);
    assert.equal(details.visibility, "unknown", registry);
    assert.equal(details.repository, "team/api", registry);
    assert.equal(details.tag, "stable", registry);
    assert.equal(details.pinnedDigest, digest, registry);
    assert.ok(details.registry, registry);
    assert.match(details.tooltip, /Repository: team\/api/, registry);
  }
});

test("invalid or credential-like inputs cannot leak fragments or claim visibility", () => {
  const invalid = [
    "", " ", " nginx", "nginx\n", "https://public.ecr.aws/owner/api:latest",
    "https://user:do-not-return-this@public.ecr.aws/owner/api",
    "user:do-not-return-this@public.ecr.aws/owner/api",
    "public.ecr.aws/owner/api?token=do-not-return-this", "public.ecr.aws/owner/api#fragment",
    "public.ecr.aws/owner/api%2Fextra", "public.ecr.aws\\owner\\api",
    "public.ecr.aws//api", "public.ecr.aws/owner/api/", "public.ecr.aws/Owner/api",
    "public.ecr.aws/owner/api:", "public.ecr.aws/owner/api:bad:tag",
    "public.ecr.aws/owner/api@", "public.ecr.aws/owner/api@sha256:abcd",
    `public.ecr.aws/owner/api@${digest}@${digest}`,
    "public.ecr.aws:0/owner/api", "public.ecr.aws:65536/owner/api",
    "public.ecr.aws:bad/owner/api", "[:::1]/owner/api", "[::1%en0]/owner/api",
    "256.1.1.1/owner/api", "public.ecr.aws./owner/api", "-bad.example/owner/api",
    `${"a".repeat(256)}/api`,
  ];
  for (const image of invalid) {
    const details = describeRegistry(image);
    assert.equal(details.provider, "unknown", image);
    assert.equal(details.visibility, "unknown", image);
    assert.equal(details.registry, "", image);
    assert.equal(details.repository, "", image);
    assert.equal(details.tag, "", image);
    assert.equal(details.pinnedDigest, "", image);
    assert.match(details.visibilityReason, /invalid or unsupported/, image);
    assert.ok(!JSON.stringify(details).includes("do-not-return-this"));
  }
});
