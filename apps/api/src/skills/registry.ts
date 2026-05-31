import type { SkillName } from "@pit/shared";
import type { Skill } from "./types.js";

export class SkillRegistry {
  private readonly skills = new Map<SkillName, Skill<unknown, unknown>>();

  register<I, O>(skill: Skill<I, O>) {
    if (this.skills.has(skill.name)) throw new Error(`Skill already registered: ${skill.name}`);
    this.skills.set(skill.name, skill as Skill<unknown, unknown>);
    return this;
  }

  get<I, O>(name: SkillName) {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Skill not registered: ${name}`);
    return skill as Skill<I, O>;
  }
}
