const admin = new URL('../admin.html', import.meta.url);
admin.searchParams.set('editor', '1');
const post = new URLSearchParams(location.search).get('post');
if (post) admin.searchParams.set('post', post);
location.replace(admin);
