export interface ConsequenceFinding {id?:string;severity?:string;excluded?:boolean;classification?:string;category?:string;rule?:string;title?:string;evidence?:string;fix?:string;suggestion?:string}
export function explainConsequence(finding:ConsequenceFinding):{meaning:string;consequence:string;action:string;uncertain:boolean};
