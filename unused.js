// Block#run
const AsyncFunction = async function(){}.constructor
const GeneratorFunction = function*(){}.constructor
const AsyncGenerator = async function*(){}.constructor
try {
	const result = scope.eval(this.code)
	console.log('result', result)
	if(result instanceof Promise){
		this.type = 'async'
		this.result = await result
	}
	// if(result && (result[Symbol.toStringTag] === 'Generator' || result[Symbol.toStringTag] === 'AsyncGenerator')){
	else if(result instanceof GeneratorFunction){
		for(let generator = result, value, done; {value, done} = generator.next(), !done; ){
			this.result = value
			this.state = 'changed'
			await new Promise(r => requestAnimationFrame(r))
		}
	}
	else if(result instanceof AsyncGenerator){
		for(let generator = result, value, done; {value, done} = await generator.next(), !done; ){
			this.result = value
			this.state = 'changed'
			await new Promise(r => requestAnimationFrame(r))
		}
	}
	else{
		this.result = result
		this.state = 'changed'
	}
}