import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createAdmin() {
  const email = "info@inluwa.com";
  const password = "password123";

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    if (error.message.includes("already registered") || error.code === "email_exists") {
      console.log("User already exists, fetching user...");
      const { data: usersData } = await supabase.auth.admin.listUsers();
      const existing = usersData.users.find(u => u.email === email);
      if (existing) {
        await ensureProfileAndOrg(existing.id, email);
      }
    } else {
      console.error("Error creating user:", error);
    }
    return;
  }

  if (data.user) {
    console.log("Created user:", data.user.id);
    await ensureProfileAndOrg(data.user.id, email);
  }
}

async function ensureProfileAndOrg(userId: string, email: string) {
  // Check profile
  const { data: profile, error: profileErr } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (profileErr && profileErr.code !== 'PGRST116') {
    console.error("Error fetching profile:", profileErr);
  }
  
  if (!profile) {
    const { error: insErr } = await supabase.from("profiles").insert({
      id: userId,
      email: email,
      name: "Info Admin",
      role: "ADMIN",
    });
    if (insErr) console.error("Error inserting profile:", insErr);
    else console.log("Profile created");
  } else if (profile.role !== "ADMIN") {
    const { error: updErr } = await supabase.from("profiles").update({ role: "ADMIN" }).eq("id", userId);
    if (updErr) console.error("Error updating profile:", updErr);
    else console.log("Profile role updated to ADMIN");
  } else {
    console.log("Profile already valid");
  }

  // Check org (query by ownerId since organizations table doesn't have createdBy column)
  const { data: orgs, error: orgsErr } = await supabase.from("organizations").select("*").eq("ownerId", userId);
  if (orgsErr) {
    console.error("Error listing organizations:", orgsErr);
  }
  let orgId = orgs?.[0]?.id;
  
  if (!orgId) {
    const { data: newOrg, error: newOrgErr } = await supabase.from("organizations").insert({
      name: "Inluwa Workspace",
      slug: "inluwa-ai",
      ownerId: userId,
    }).select().single();
    if (newOrgErr) {
      console.error("Error creating organization:", newOrgErr);
    }
    if (newOrg) orgId = newOrg.id;
    console.log("Organization created:", orgId);
  } else {
    console.log("Organization already exists:", orgId);
  }

  if (orgId) {
    // Check membership (workspaceId instead of organizationId)
    const { data: membership, error: memErr } = await supabase.from("organization_members")
      .select("*")
      .eq("workspaceId", orgId)
      .eq("userId", userId)
      .maybeSingle();
      
    if (memErr) {
      console.error("Error checking membership:", memErr);
    }
      
    if (!membership) {
      const { error: insMemErr } = await supabase.from("organization_members").insert({
        workspaceId: orgId,
        userId: userId,
        role: "SYSTEM_ADMIN"
      });
      if (insMemErr) console.error("Error creating org membership:", insMemErr);
      else console.log("Org membership created");
    } else {
      console.log("Org membership already exists");
    }

    // Ensure default project exists for this org
    const { data: projects, error: projErr } = await supabase.from("projects").select("*").eq("organizationId", orgId);
    if (projErr) {
      console.error("Error checking projects:", projErr);
    }
    if (!projects || projects.length === 0) {
      const { error: insProjErr } = await supabase.from("projects").insert({
        organizationId: orgId,
        name: "Default Project",
        createdBy: userId,
      });
      if (insProjErr) console.error("Error creating project:", insProjErr);
      else console.log("Default Project created");
    } else {
      console.log("Default Project already exists");
    }
  }
}

createAdmin().catch(console.error);
