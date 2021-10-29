export async function get() {
    return {
        status: 200,
        body: '',
        headers: {
            'set-cookie': [
                'a=b',
                'c=d'
            ]
        }
    }
}