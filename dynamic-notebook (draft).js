function template(render){
	return function (strings) {
		const parts = [strings[0]]
		for(let i = 1, l = arguments.length; i < l; i++) parts.push(arguments[i], strings[i])

		// Concatenate the text using comments as placeholders.
		const nodes = []
		let node
		let string = ''
		for (const part of [].concat(...parts)) {
			if (part instanceof Node) {
				if (!node) {
					node = document.createDocumentFragment()
					string += `<!--o:${nodes.length}-->`
					nodes.push(node)
				}
				node.appendChild(part)
			} else {
				node = undefined
				string += part
			}
		}

		/*const _strings = [...strings]
		const nodes = []
		let string = _strings.shift()

		// Concatenate the text using comments as placeholders.
		for (const part of args) {
			if (part instanceof Node) {
				string += `<!--o:${nodes.length}-->`
				nodes.push(part)
			} else if (Array.isArray(part)) {
				let root
				for (const _part of part) {
					if (_part instanceof Node) {
						if (!root) {
							root = document.createDocumentFragment()
							string += `<!--o:${nodes.length}-->`
							nodes.push(root)
						}
						root.appendChild(_part)
					} else {
						root = undefined
						string += _part
					}
				}
			} else {
				string += part
			}
			string += _strings.shift()
		}*/

		// Render the text.
		const root = render(string)

		// Walk the rendered content to replace comment placeholders.
		if (nodes.length) {
			const placeholders = {}
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT, null, false)
			while (walker.nextNode()) {
				node = walker.currentNode
				if (node.nodeValue.startsWith('o:')) {
					const i = node.nodeValue.slice(2)
					placeholders[i] = node
				}
			}
			for (const i in placeholders) {
				const node = placeholders[i]
				node.parentNode.replaceChild(nodes[i], node)
			}
		}

		// If the rendered content is a single node, detach and return the node.
		return root.childNodes.length === 1 ?
			root.removeChild(root.firstChild) :
			root
	}
}

const html = template(string => {
	const template = document.createElement('template')
	template.innerHTML = string.trim()
	const content = document.importNode(template.content, true)
	if(content.childNodes.length === 1){
		return content
	}else{
		const div = document.createElement('div')
		div.appendChild(content)
		return div
	}
})


class Block extends HTMLElement {
	constructor(scope, name, code){
		super()

		this.scope = scope
		this.name = name

		this.append(
			// this.$name = html`<h3>${name}</h3>`,
			this.$result = html`<div class="result"><span></span></div>`,
			this.$code = html`<textarea class="code"></textarea>`,
			this.$type = html`<div class="type"></div>`,
			this.$references = html`<div class="references"><span></span></div>`,
		)
		this.$code.addEventListener('input', e => {
			this.code = e.target.value
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
		console.log(`Running block ${this.name}`)
		this.state = 'waiting'

		for(const observer of this.setterObservers || []) observer.unobserve()
		const references = new Set()
		const getterObserver = this.scope[Scope.globalObserver].on('get', e => references.add(e.detail))
 
		try {
			const result = await this.scope.eval(this.code)
			console.log('result', result)
			if(result && (result[Symbol.toStringTag] === 'Generator' || result[Symbol.toStringTag] === 'AsyncGenerator')){
				for(let generator = result, value, done; {value, done} = await generator.next(), !done; ){
					this.result = value
					this.state = 'changed'
					await new Promise(r => requestAnimationFrame(r))
				}
			}else{
				this.result = result
				this.state = 'changed'
			}
		}
		catch(e){
			this.state = 'error'
			this.result = e
			getterObserver.unobserve()
			// throw e
		}
		finally {
			this.references = references
			getterObserver.unobserve()
			this.setterObservers = [...references].map(observable => observable.on('set', () => {
				console.log(`ObservableValue ${observable.name} changed`, observable)
				// requestAnimationFrame(() => this.run())
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

	set references(references){
		this.$references.lastChild.replaceWith(html`${[...references].map(o => o.name).join(',')}`)
	}
}
Block.all = new Set()
customElements.define('dynamic-block', Block)

EventTarget.prototype.trigger = function(name, detail){
	this.dispatchEvent(new CustomEvent(name, {detail}))
}
EventTarget.prototype._addEventListener = EventTarget.prototype.addEventListener
EventTarget.prototype.on = EventTarget.prototype.addEventListener = function(){
	this._addEventListener(...arguments)
	return {
		unobserve: () => this.off(...arguments)
	}
}
EventTarget.prototype.off = EventTarget.prototype.removeEventListener

class ObservableValue extends EventTarget {
	constructor(name, value){
		super()
		this.name = name
		this.value = value
	}
	get(){
		this.trigger('get')
		return this.value
	}
	async set(value){
		this.value = value
		this.trigger('set')
		/*for(const f of [...this.observers]){
			f()
			await new Promise(r => requestAnimationFrame(r))
		}*/
	}
}




function getBody(f){
	f = f.toString()
	return f.substring(f.indexOf('{') + 1, f.lastIndexOf('}')).trim()
}
function deIndent(code){
	const [line, ...lines] = code.split('\n')
	const indentLevel = Math.min(...lines.map(l => {
		const m = l.match(/^\t+/)
		return m ? m[0].length : 0
	}))
	return [line, ...lines.map(l => l.slice(indentLevel))].join('\n')
}

function Scope(){
	const scope = {
		Number, String, Object, Array, Set, Map, WeakMap, Date, Math, Promise,
		console,
		setTimeout: setTimeout.bind(window), setInterval: setInterval.bind(window), fetch: fetch.bind(window),
		html,
		yield: new ObservableValue('yield'),
		eval(code){
			let isGenerator = false
			scope.yield.on('get', () => isGenerator = true, {once: true})
			try {
				return eval(`with(this){\n${code}\n}`)
			}catch(e){
				console.log(e, code, isGenerator, code.includes('yield'), e.toString().startsWith('SyntaxError: Unexpected'))
				if(isGenerator || code.includes('yield') || e.toString().startsWith('SyntaxError: Unexpected')){
					try {
						return eval(`with(this) (function *(){\n${code}\n})()`)
					}catch(e){
						if(e == 'SyntaxError: await is only valid in async function'){
							return eval(`with(this) (async function *(){\n${code}\n})()`)
							// return eval(`with(this)(async () => {\nreturn ${code}\n})()`)
						}
					}
				}else if(e == 'SyntaxError: Illegal return statement'){
					return eval(`with(this) (() => {\n${code}\n})()`)
				}else if(e == 'SyntaxError: await is only valid in async function'){
					return eval(`with(this) (async () => (\n${code}\n))()`)
					// return eval(`with(this)(async () => {\nreturn ${code}\n})()`)
				}
				throw e
			}
		}
	}
	const whitelist = Object.keys(scope)

	const globalObserver = scope[Scope.globalObserver] = new EventTarget()
	const createObservable = name => {
		const observable = new ObservableValue(name)
		observable.on('get', () => globalObserver.trigger('get', observable))
		observable.on('set', () => globalObserver.trigger('set', observable))
		return observable
	}

	return new Proxy(scope, {
		has(){
			return true
		},
		get(o, p){
			if(p === Symbol.unscopables) return undefined

			if(o[p] === undefined){
				o[p] = createObservable(p)
				globalObserver.trigger('get', o[p]) // o[p].get()
				throw `Variable "${p}" doesn't exist.`
			}else if(o[p] instanceof ObservableValue){
				const v = o[p].get()
				console.log(`Get ${p}:`, v)
				return v
			}else if(whitelist.includes(p)){
				return Reflect.get(...arguments)
			}else{
				return o[p]
			}
		},
		set(o, p, v){
			if (p === Symbol.unscopables) return undefined
	
			if(!o[p]) o[p] = createObservable(p)
			else o[p].set(v)
			
			console.log(`Set ${p} to`, v)
			return true
		}
	})
}
Scope.globalObserver = Symbol('globalObserver')

class Notebook extends HTMLElement {
	constructor(name, blocks){
		super()

		this.scope = new Scope()

		for(const name in blocks){
			const code = deIndent(getBody(blocks[name]))
			this.append(new Block(this.scope, name, code))
		}

		this.append(
			this.$addButton = html`<button>Add</button>`
		)
		this.$addButton.addEventListener('click', () => {
			const block = new Block(this.scope)
			block.state = 'new'
			this.insertBefore(block, this.$addButton)
		})
	}

	get blocks(){
		return this.childNodes
	}

	static get storedNotebooks(){
		if(!this._storedNotebooks) this._storedNotebooks = JSON.parse(localStorage.dynamicNotebooks || '[]')
		return this._storedNotebooks
	}
}
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
		a * b * c
		//
	},
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
	*yield(){
		for(let i = 0; i < 100; i++) yield i
	},
	async *yieldAsync(){
		const $button = html`<button>Start</button>`
		yield $button
		await new Promise(r => $button.onclick = r)
		for(let i = 0; i <= 360; i++){
			const color = `hsl(${i}, 50%, 50%)`
			yield html`<span style="color: ${color}">${i}</span>`
		}
	}
})
notebook.scope.eval('a = 4')
document.body.appendChild(notebook)



/*document.body.appendChild(new Notebook('', {
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

		const $range = html`<input type="range">`
		$range.on('input', e =>  price = e.target.value)
		$range
	},
	random(){
		html`My favorite number is <b>${Math.random() * 100 | 0}</b>.`
	},
	async wait(){
		await new Promise(r => setTimeout(() => {
			r('Done!')
		}, 2000))
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
}))*/