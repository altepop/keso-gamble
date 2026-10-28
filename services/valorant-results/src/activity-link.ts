import discord from '../discord-config.json' with {type:'json'};
/** Official Activity share URL. No account IDs, access tokens or external website login. */
export function activityLaunchComponents(applicationId=discord.applicationId){
 if(!/^\d{15,22}$/.test(applicationId))throw Error('Invalid Activity application');
 return [{type:1,components:[{type:2,style:5,label:'Activityを開く',emoji:{name:'🎮'},url:'https://discord.com/activities/'+applicationId}]}];
}
