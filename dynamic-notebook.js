class Block extends HTMLElement {
	constructor(scope, name, code){
		super()

		this.scope = scope
		this.name = name

		this.append(
			// this.$name = html`<h3>${name}</h3>`,
			this.$result = html`<div class="result"><span></span></div>`,
			this.$code = html`<dy-textarea class="code"></dy-textarea>`,
			html`<div class="meta">
				${this.$type = html`<div class="type"></div>`}
				${this.$references = html`<div class="references"></div>`}
			</div>`
		)
		this.$code.on({
			input: e => {
				this.code = this.$code.value
			}
		})
		if(code) this.code = code

		Block.all.add(this)
	}

	set code(code){
		this.$code.value = code
		this.run()
	}
	get code(){
		return this.$code.value
	}

	async run(){
		await new Promise(r => requestAnimationFrame(r))

		console.log(`Running block "${this.name}"`)
		this.state = 'waiting'

		for(const observer of this.setterObservers || []) observer.unobserve()
		const references = new Set()
		const getterObserver = this.scope.globalObserver.on('get', e => references.add(e.detail))
 
		const {scope, code} = this
		let isGenerator = false
		// scope.yield.on('get', () => isGenerator = true, {once: true})

		try {
			const result = scope.eval(code)
			this.type = 'expression'
			this.result =
				result instanceof AsyncGenerator ? await this.generateResult(result()) :
				result instanceof GeneratorFunction ? await this.generateResult(result()) :
				await result
		}
		catch(e){
			// console.log(e, code, isGenerator, code.includes('yield'), e.toString().startsWith('SyntaxError: Unexpected'))
			if(isGenerator || code.includes('yield') || e.toString().startsWith('SyntaxError: Unexpected')){
				try {
					const generator = scope.eval(`(function *(){\n${code}\n})`)()
					this.type = 'generator'
					await this.generateResult(generator)
				}catch(e){
					if(e == 'SyntaxError: await is only valid in async function'){
						this.type = 'async generator'
						const generator = scope.eval(`(async function *(){\n${code}\n})`)()
						await this.generateResult(generator)
					}else{
						this.result = e
					}
				}
			}else if(e == 'SyntaxError: Illegal return statement'){
				this.type = 'function'
				this.result = scope.eval(`() => {\n${code}\n}`)()
			}else if(e == 'SyntaxError: await is only valid in async function'){
				const promise = scope.eval(`async () => {\n${code}\n}`)()
				this.type = 'async'
				this.result = await promise
				// return eval(`with(this)(async () => {\nreturn ${code}\n})()`)
			}else{
				this.result = e
			}
		}
		finally {
			this.references = references
			getterObserver.unobserve()
			this.setterObservers = [...references].map(observable => observable.on('set', () => {
				console.log(`ObservableValue ${observable.name} changed`, observable)
				this.run()
			}))
		}
	}

	set state(state){
		this.removeAttribute('state')
		this.offsetWidth
		this.setAttribute('state', state)
	}
	set type(type){
		this.$type.textContent = type
	}

	set result(result){
		// this.$result.innerHTML = ''
		// this.$result.append(html`${result}`)

		if(result instanceof Error){
			this.state = 'error'
			console.error(result)
		}else{
			this.state = 'changed'
		}

		const $result = (
			result instanceof Node ? result :
			result instanceof Error ? html`<output class="error">${result}</output>` :
			result !== undefined ? JSON.stringify(result) :
			''
		)
		if(this.$result.lastChild){
			this.$result.lastChild.replaceWith($result)
		}else{
			this.$result.append($result)
		}
	}

	async generateResult(generator){
		for(let value, done; {value, done} = await generator.next(), !done; ){
			this.result = value
			await new Promise(r => requestAnimationFrame(r))
		}
	}

	set references([...references]){
		if(references.length){
			this.$references.replaceContents('Watching:', ...references.map(o => html`<span>${o.name}</span>`))
		}else{
			this.$references.empty()
		}
	}
}
Block.all = new Set()
customElements.define('dynamic-block', Block)

class ObservableValue extends EventTarget {
	constructor(options){
		super()
		this.value = 'value' in options ? options.value : ObservableValue.UNDEFINED
		this.name = options.name
	}
	get(){
		this.trigger('get')
		return this.value
	}
	async set(value){
		this.value = value
		this.trigger('set', value)
		/*for(const f of [...this.observers]){
			f()
			await new Promise(r => requestAnimationFrame(r))
		}*/
	}
}
ObservableValue.UNDEFINED = Symbol()

function observe(value){
	return new ObservableValue({value})
}

class Generator {
	constructor(executor){
		let initialValue
		let resolveNext = v => initialValue = v
		executor(v => resolveNext(v))
		return async function*(){
			yield initialValue
			while(true) yield await new Promise(r => resolveNext = r)
		}
	}
	static listen(eventTarget, eventName, initialValue, map = _ => _){
		return new Generator(y => {
			y(initialValue)
			eventTarget.on(eventName, function(){
				y(map.apply(this, arguments))
			})
		})
	}
	static from(observable){
		if(observable instanceof ObservableValue){
			return new Generator(y => {
				y(observable.get())
				observable.on('set', e => y(observable.get()))
			})
		}
	}
}




function getBody(f){
	f = f.toString()
	return f.substring(f.indexOf('{') + 1, f.lastIndexOf('}')).trim()
}
function deIndent(code){
	const [line, ...lines] = code.split('\n')
	const indentLevel = Math.min(...lines.filter(_ => _).map(l => {
		const m = l.match(/^\t+/)
		return m ? m[0].length : 0
	}))
	return [line, ...lines.map(l => l.slice(indentLevel))].join('\n')
}

function Scope(){
	const scope = this.scope = {
		Number, String, Object, Array, Set, Map, WeakMap, Date, Math, Promise,
		undefined, NaN, console,
		setTimeout: setTimeout.bind(window), setInterval: setInterval.bind(window), fetch: fetch.bind(window),
		html, Generator, ObservableValue, observe,
		yield: new ObservableValue({name: 'yield'}),
		eval(code){
			return eval(`with(this){\n${code}\n}`)
		}
	}
	const whitelist = Object.keys(scope)

	const globalObserver = this.globalObserver = new EventTarget()
	const createObservable = p => {
		console.log(`Creating observable ${p}`)
		const observable = scope[p] = new ObservableValue({name: p})
		observable.on('get', () => globalObserver.trigger('get', observable))
		observable.on('set', () => globalObserver.trigger('set', observable))
		return observable
	}

	this.proxiedScope = new Proxy(scope, {
		has(){
			return true
		},
		get(scope, p){
			if(p === Symbol.unscopables) return undefined
			if(whitelist.includes(p)) return Reflect.get(...arguments)

			const property = p in scope ? scope[p] : createObservable(p)
			if(property instanceof ObservableValue){
				const v = property.get()
				console.log(`Get ${p}:`, v)
				if(v === ObservableValue.UNDEFINED) throw new ReferenceError(`Variable "${p}" doesn't exist.`)
				return v
			}
			return property
		},
		set(scope, p, v){
			if (p === Symbol.unscopables) return undefined
			
			const property = p in scope ? scope[p] : createObservable(p)
			console.log(`Set "${p}" to`, v)
			property.set(v)
			return true
		}
	})
}
Scope.prototype.eval = function(){
	const result = this.proxiedScope.eval(...arguments)
	if(result === this.proxiedScope) return this.scope
	return result
}


class Notebook extends HTMLElement {
	constructor(name, blocks){
		super()

		this.scope = new Scope()

		this.append(html`<h2>${name}</h2>`)
		for(const name in blocks){
			const code = deIndent(getBody(blocks[name]))
			this.append(new Block(this.scope, name, code))
		}
		if(!this.blocks.length){
			this.append(new Block(this.scope))
		}
		this.append(
			this.$addButton = html`<button>Add</button>`
		)
		
		this.$addButton.addEventListener('click', () => {
			const block = new Block(this.scope)
			block.state = 'new'
			this.insertBefore(block, this.$addButton)
		})

		Notebook.instances.push(this)
	}

	get blocks(){
		return this.childNodes
	}

	static get storedNotebooks(){
		if(!this._storedNotebooks) this._storedNotebooks = JSON.parse(localStorage.dynamicNotebooks || '[]')
		return this._storedNotebooks
	}
	static save(){
		localStorage.dynamicNotebooks = JSON.stringify(Notebook.instances)
	}
}
Notebook.instances = []
customElements.define('dynamic-notebook', Notebook)


const notebook = new Notebook('Dynamic Notebook', {
	helloWorld(){
		'hello world'
	},
	a(){
		a = 1
	},
	b(){
		b = 2
	},
	c(){
		c = a + b
	},
	product(){
		// Function
		return a * b * c
	},
	/*random(){
		html`My favorite number is <b>${Math.random() * 100 | 0}</b>.`
	},
	wait(){
		new Promise(r => setTimeout(() => {
			r('Done!')
		}, 2000))
	},
	async async(){
		await new Promise(r => setTimeout(r, 4000))
		return 'Whee!'
	},
	*yield(){
		for(let i = 0; i < 100; i++) yield i
	},
	async *yieldAsync(){
		const $button = html`<button>Start Counting</button>`
		yield $button
		await new Promise(r => $button.onclick = r)
		for(let i = 0; i <= 360; i++){
			const color = `hsl(${i}, 50%, 50%)`
			yield html`<span style="color: ${color}">${i}</span>`
		}
	},
	async *time(){
		const $button = html`<button>Show Time</button>`
		yield $button
		await new Promise(r => $button.onclick = r)
		while(true) yield Date.now()
	}*/
})
notebook.scope.eval('a = 4')
document.body.appendChild(notebook)



document.body.appendChild(new Notebook('Economics', {
	revenue(){
		revenue = price * quantity
	},
	price(){
		price = 5
	},
	quantity(){
		quantity = 10
	},
	priceSlider(){
		// html`<input type="range" oninput="price = this.value">`

		$price = html`<input type="range">`
		$price.on('input', e => price = e.target.valueAsNumber)
		$price
	},
	viewofPrice(){
		Generator.listen($price, 'input', price, e => e.target.valueAsNumber)
	},
	functionalGenerator(){
		let x = observe(0)
		setInterval(() => x.set(x.get()+1), 1000)
		Generator.from(x)
	}
}))


document.body.appendChild(new Notebook('Physics', {
	F(){
		F = m * a
	},
	m(){
		m = 5
	},
	a(){
		a = 10
	},
	v(){
		v
	},
	accelerate(){
		v = 0
		// setInterval(() => {
		// 	v += a
		// }, 1000)
	}
}))


document.body.appendChild(new Notebook('Graphics', {
	color(){
		color = 'purple'
	},
	canvas(){
		const canvas = html`<canvas>`
		const c = canvas.getContext('2d')
		console.log(color)
		c.fillStyle = color
		c.fillRect(0, 0, 90, 90)
		canvas
	},
}))