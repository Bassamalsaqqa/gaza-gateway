import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStaffAccessFragment } from "../../src/lib/api/staff-access-link.ts";
import { validateStaffLoginRequest } from "../../src/lib/api/identity-client-validators.ts";

describe("Staff access links and compatible login identifier", () => {
  const token="A".repeat(43);
  it("accepts one canonical fragment proof without decoding aliases", () => {
    assert.deepEqual(parseStaffAccessFragment("#token="+token),{token,error:null});
    for(const last of "AEIMQUYcgkosw048") assert.equal(parseStaffAccessFragment("#token="+"a".repeat(42)+last).error,null);
  });
  it("distinguishes absent links from malformed or noncanonical proofs", () => {
    assert.equal(parseStaffAccessFragment("").error,"missing");
    for(const fragment of ["#token="+token+"&redirect=/admin", "#token=%41"+"A".repeat(42), "#token="+"A".repeat(42), "#token="+token+"A", "#token="+"A".repeat(42)+"B", "#token="+token+"\n", "#other="+token, "#token=<script>"]) {
      assert.deepEqual(parseStaffAccessFragment(fragment),{token:null,error:"invalid"});
    }
  });
  it("retains the username wire key for staff emails including longer addresses", () => {
    const email="a".repeat(64)+"@example.invalid";
    assert.deepEqual(validateStaffLoginRequest({username:email,password:"exact password bytes "}),{username:email,password:"exact password bytes "});
    assert.equal(validateStaffLoginRequest({username:"owner",password:"correct-staff-password"}).username,"owner");
  });
  it("rejects oversized identifiers, malformed Unicode and undeclared aliases", () => {
    for(const body of [{username:"a".repeat(255),password:"secret"},{username:"\ud800",password:"secret"},{email:"owner@example.invalid",password:"secret"},{username:"owner",password:"secret",role:"admin"}]) assert.throws(()=>validateStaffLoginRequest(body));
  });
});
