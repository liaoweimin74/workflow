<template>
    <span @click.capture="handleClick">
        <template v-if="showField">
            {{ rule.field }}
        </template>
        <template v-else>
            <template v-if="rule.warning">
                <Warning :tooltip="rule.warning">
                    {{ rule.title }}
                </Warning>
            </template>
            <template v-else>
                {{ rule.title }}
            </template>
        </template>
    </span>
</template>

<script>
import {defineComponent} from 'vue';
import Warning from './Warning.vue';

export default defineComponent({
    name: 'FormLabel',
    components: {
        Warning,
    },
    props: {
        rule: Object,
    },
    data() {
        return {
            showField: false,
        };
    },
    methods: {
        handleClick(e) {
            if (e.ctrlKey || e.metaKey) {
                e.stopPropagation();
                e.preventDefault();
                this.showField = !this.showField;
            }
        },
    },
});
</script>

