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

Object.assign(Node.prototype, {
	empty(){
		while (this.hasChildNodes()) this.removeChild(this.lastChild)
	},
	replaceContents(...contents){
		this.empty()
		this.append(...contents)
	}
})

Object.assign(EventTarget.prototype, {
	on(){
		if(arguments[0] instanceof Object){
			return Object.entries(arguments[0]).map(args => this.on(...args))
		}

		this.addEventListener(...arguments)
		return {
			unobserve: () => this.removeEventListener(...arguments)
		}
	},
	
	trigger(name, detail){
		this.dispatchEvent(new CustomEvent(name, {detail}))
		return this
	}
})

Function.prototype.toJSON = Function.prototype.toString

const AsyncFunction = async function(){}.constructor
const GeneratorFunction = function*(){}.constructor
const AsyncGenerator = async function*(){}.constructor