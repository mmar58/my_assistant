<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  
  let {
    models = $bindable([]),
    selectedModel = $bindable("")
  }: {
    models?: any[];
    selectedModel?: string;
  } = $props();
</script>

<div class="w-[280px]">
  <Select.Root type="single" bind:value={selectedModel}>
    <Select.Trigger>
      {selectedModel ? selectedModel : "Select a model"}
    </Select.Trigger>
    <Select.Content>
      <Select.Group>
        <Select.GroupHeading>Ollama Models</Select.GroupHeading>
        {#each models as model}
          <Select.Item value={model.name} label={model.name}>
            {model.name}
          </Select.Item>
        {/each}
      </Select.Group>
    </Select.Content>
  </Select.Root>
</div>
