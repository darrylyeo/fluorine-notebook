class DYTextArea extends HTMLElement {
	constructor(){
		super()

		const initialValue = this.textContent || this.getAttribute('value')

		this.replaceContents(
			this.$editor = html`<span contenteditable></span>`,
			this.$input = html`<textarea class="input" tabindex="-1"></textarea>`
		)

		const {$editor, $input} = this

		for(const {name, value} of this.attributes){
			if(name === 'class' || name === 'id') continue
			if(name !== 'name') this.$editor.setAttribute(name, value)
			this.$input.setAttribute(name, value)
		}
		if(initialValue) this.value = initialValue

		try { $editor.contentEditable = 'plaintext-only' }catch(e){}

		$editor.on({
			paste: e => {
				e.preventDefault()
				// const text = e.clipboardData.getData('Text')
				// document.execCommand('inserttext', false, text)
				const text = e.clipboardData.getData('text/plain')
				document.execCommand('insertHTML', false, text)
			},

			// https://stackoverflow.com/questions/48517637/ie11-drop-plain-text-into-contenteditable-div
			drop: e => {
				e.preventDefault()
				const text = e.dataTransfer.getData('Text')

				const range = document.caretRangeFromPoint(e.clientX, e.clientY)
				range.deleteContents()
				const textNode = document.createTextNode(text)
				range.insertNode(textNode)
				range.selectNodeContents(textNode)
				range.collapse(false)
			
				const selection = window.getSelection()
				selection.removeAllRanges()
				selection.addRange(range)
			},

			copy: e => {
				if (e.clipboardData) {
					const text = window.getSelection().toString()
					e.clipboardData.setData('text/plain', text)
					e.preventDefault()
				}
			},

			input: e => {
				this.value = $editor.textContent
			},

			blur: e => {
				this.value = this.value.trim()
			}
		})

		$input.on({
			input: () => {
				this.value = $input.value
			},
			focus: () => {
				this.$editor.focus()
			}
		})
	}

	get value(){
		return this.$input.value
	}
	set value(value){
		if(value !== this.$input.value) this.$input.value = value
		if(value !== this.$editor.textContent) this.$editor.textContent = value
	}

	addEventListener(){
		this.$editor.addEventListener(...arguments)
	}
}
customElements.define('dy-textarea', DYTextArea)