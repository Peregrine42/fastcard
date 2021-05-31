const initSignIn = async () => {
    await new Promise(res => window.addEventListener("load", res))

    const el = document.getElementById("username") as HTMLInputElement
    el.focus()
    el.select()
}

initSignIn().catch(e => console.error(e))