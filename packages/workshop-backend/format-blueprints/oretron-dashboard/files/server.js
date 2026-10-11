import { DurableObject } from "cloudflare:workers";

export class Gadget extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
  }

  async fetchData() {
    return {
      projects: [],
      leads: [],
      metrics: { projects: 0, leads: 0, docs: 0, agents: 0 }
    };
  }

  async getData() {
    return this.fetchData();
  }
}
